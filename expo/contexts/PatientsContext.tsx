import createContextHook from "@nkzw/create-context-hook";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Patient, Study, Gender } from "@/types/medical";

const STORAGE_KEY = "@fluidiq_patients";

export const [PatientsProvider, usePatients] = createContextHook(() => {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    void loadPatients();
  }, []);

  const loadPatients = async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored && stored.trim().length > 0) {
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            const migratedPatients = parsed.map((patient: any) => ({
              ...patient,
              studies: patient.studies.map((study: any) => {
                if (!study.protocolType) {
                  return {
                    ...study,
                    protocolType: "responder",
                  };
                }
                return study;
              }),
            }));
            setPatients(migratedPatients);
          } else {
            console.error("Stored data is not an array, resetting...");
            await AsyncStorage.removeItem(STORAGE_KEY);
            setPatients([]);
          }
        } catch (parseError) {
          console.error("Error parsing patients JSON:", parseError, "Data:", stored);
          await AsyncStorage.removeItem(STORAGE_KEY);
          setPatients([]);
        }
      }
    } catch (error) {
      console.error("Error loading patients:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const savePatients = async (updatedPatients: Patient[]) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedPatients));
      setPatients(updatedPatients);
    } catch (error) {
      console.error("Error saving patients:", error);
    }
  };

  const addPatient = useCallback(async (patientId: string, gender: Gender, age?: number, weight?: number, height?: number, bsa?: number) => {
    const newPatient: Patient = {
      id: Date.now().toString(),
      patientId,
      gender,
      age,
      weight,
      height,
      bsa,
      studies: [],
      createdAt: new Date().toISOString(),
    };
    const updatedPatients = [...patients, newPatient];
    await savePatients(updatedPatients);
    return newPatient;
  }, [patients]);

  const updatePatient = useCallback(async (id: string, patientId: string, gender: Gender, age?: number, weight?: number, height?: number, bsa?: number) => {
    const updatedPatients = patients.map((p) =>
      p.id === id ? { ...p, patientId, gender, age, weight, height, bsa } : p
    );
    await savePatients(updatedPatients);
  }, [patients]);

  const deletePatient = useCallback(async (id: string) => {
    const updatedPatients = patients.filter((p) => p.id !== id);
    if (updatedPatients.length === 0) {
      await AsyncStorage.removeItem(STORAGE_KEY);
      setPatients([]);
      setIsLoading(false);
    } else {
      await savePatients(updatedPatients);
    }
  }, [patients]);

  const addStudy = useCallback(async (patientId: string, study: Study) => {
    const updatedPatients = patients.map((p) =>
      p.id === patientId ? { ...p, studies: [study, ...p.studies] } : p
    );
    await savePatients(updatedPatients);
  }, [patients]);

  const deleteStudy = useCallback(async (patientId: string, studyId: string) => {
    const updatedPatients = patients.map((p) =>
      p.id === patientId
        ? { ...p, studies: p.studies.filter((s) => s.id !== studyId) }
        : p
    );
    await savePatients(updatedPatients);
  }, [patients]);

  const getPatientById = useCallback((id: string): Patient | undefined => {
    return patients.find((p) => p.id === id);
  }, [patients]);

  const patientIdExists = useCallback((patientId: string, excludeId?: string): boolean => {
    return patients.some(
      (p) => p.patientId.toLowerCase() === patientId.toLowerCase() && p.id !== excludeId
    );
  }, [patients]);

  return useMemo(() => ({
    patients,
    isLoading,
    addPatient,
    updatePatient,
    deletePatient,
    addStudy,
    deleteStudy,
    getPatientById,
    patientIdExists,
  }), [patients, isLoading, addPatient, updatePatient, deletePatient, addStudy, deleteStudy, getPatientById, patientIdExists]);
});
