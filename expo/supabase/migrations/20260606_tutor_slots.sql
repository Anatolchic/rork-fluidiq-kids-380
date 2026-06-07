CREATE TABLE IF NOT EXISTS public.tutor_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slot_start timestamptz NOT NULL,
  duration_minutes int NOT NULL DEFAULT 60 CHECK (duration_minutes IN (30, 60, 90, 120)),
  is_intro boolean NOT NULL DEFAULT false,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tutor_id, slot_start)
);

CREATE INDEX IF NOT EXISTS tutor_slots_tutor_date_idx ON public.tutor_slots(tutor_id, slot_start);
CREATE INDEX IF NOT EXISTS tutor_slots_available_idx ON public.tutor_slots(tutor_id, slot_start) WHERE booking_id IS NULL;

ALTER TABLE public.tutor_slots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ts_anon_read ON public.tutor_slots;
CREATE POLICY ts_anon_read ON public.tutor_slots FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS ts_tutor_write ON public.tutor_slots;
CREATE POLICY ts_tutor_write ON public.tutor_slots FOR ALL TO authenticated
  USING (tutor_id = auth.uid()) WITH CHECK (tutor_id = auth.uid());

CREATE OR REPLACE FUNCTION public.create_slots_bulk(p_slot_starts timestamptz[], p_duration int DEFAULT 60)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  INSERT INTO public.tutor_slots (tutor_id, slot_start, duration_minutes)
  SELECT auth.uid(), unnest(p_slot_starts), p_duration
  ON CONFLICT (tutor_id, slot_start) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;$$;

CREATE OR REPLACE FUNCTION public.delete_slot(p_slot_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n int;
BEGIN
  DELETE FROM public.tutor_slots
  WHERE id = p_slot_id AND tutor_id = auth.uid() AND booking_id IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END;$$;

CREATE OR REPLACE FUNCTION public.book_slot(
  p_slot_id uuid, p_subject text, p_level text, p_topic text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_slot record;
  v_tutor record;
  v_booking_id uuid;
  v_price int;
  v_status text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT * INTO v_slot FROM public.tutor_slots WHERE id = p_slot_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','slot_not_found'); END IF;
  IF v_slot.booking_id IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'error','already_booked'); END IF;

  SELECT price_per_hour, auto_confirm INTO v_tutor
  FROM public.tutor_profiles WHERE user_id = v_slot.tutor_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','tutor_not_found'); END IF;

  v_price := round((v_tutor.price_per_hour::numeric * v_slot.duration_minutes::numeric) / 60.0);
  IF v_slot.is_intro THEN v_price := round(v_price * 0.5); END IF;
  v_status := CASE WHEN v_tutor.auto_confirm THEN 'confirmed' ELSE 'pending' END;

  INSERT INTO public.bookings (student_id, tutor_id, subject, level, start_time, end_time, duration, price, status, topic, is_intro)
  VALUES (
    auth.uid(), v_slot.tutor_id, p_subject, p_level,
    v_slot.slot_start, v_slot.slot_start + (v_slot.duration_minutes || ' minutes')::interval,
    v_slot.duration_minutes, v_price, v_status, p_topic, v_slot.is_intro
  ) RETURNING id INTO v_booking_id;

  UPDATE public.tutor_slots SET booking_id = v_booking_id WHERE id = p_slot_id;

  INSERT INTO public.chat_rooms (booking_id, student_id, tutor_id)
  VALUES (v_booking_id, auth.uid(), v_slot.tutor_id)
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'booking_id', v_booking_id, 'price', v_price, 'status', v_status);
END;$$;

GRANT EXECUTE ON FUNCTION public.create_slots_bulk(timestamptz[], int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_slot(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.book_slot(uuid, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.tg_release_slot_on_cancel() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND NEW.status = 'cancelled' AND OLD.status != 'cancelled')
     OR TG_OP = 'DELETE' THEN
    UPDATE public.tutor_slots SET booking_id = NULL
    WHERE booking_id = COALESCE(NEW.id, OLD.id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;$$;

DROP TRIGGER IF EXISTS release_slot_on_cancel ON public.bookings;
CREATE TRIGGER release_slot_on_cancel AFTER UPDATE OR DELETE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.tg_release_slot_on_cancel();

ALTER PUBLICATION supabase_realtime ADD TABLE public.tutor_slots;

SELECT 'ok' as done;
