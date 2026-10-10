import React, { useRef, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { PrimaryButton } from './PrimaryButton';
import { colors, spacing } from '../constants/theme';

export type PhotoMoment = 'antes' | 'despues';

interface PhotoCaptureProps {
  moment: PhotoMoment;
  onCaptured: (photo: { uri: string; base64: string }, moment: PhotoMoment) => void;
  onCancel?: () => void;
}

export function PhotoCapture({ moment, onCaptured, onCancel }: PhotoCaptureProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ uri: string; base64: string } | null>(null);

  if (!permission) {
    return <Text style={styles.message}>Comprobando permiso de cámara…</Text>;
  }

  if (!permission.granted) {
    return (
      <View style={styles.box}>
        <Text style={styles.message}>
          {permission.canAskAgain
            ? 'Necesitamos acceso a la cámara para tomar la fotografía del vehículo.'
            : 'El permiso de cámara está denegado. Actívalo en los ajustes del teléfono.'}
        </Text>
        {permission.canAskAgain ? (
          <PrimaryButton label="Permitir cámara" onPress={() => void requestPermission()} />
        ) : null}
        {onCancel ? <PrimaryButton label="Cerrar" onPress={onCancel} /> : null}
      </View>
    );
  }

  const takePhoto = async () => {
    if (busy || !cameraRef.current) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.4, base64: true });
      if (!photo?.uri || !photo.base64) {
        throw new Error('empty');
      }
      setPreview({ uri: photo.uri, base64: photo.base64 });
    } catch {
      setError('No se pudo tomar la fotografía. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  if (preview) {
    return (
      <View style={styles.box}>
        <Image source={{ uri: preview.uri }} style={styles.preview} accessibilityLabel="Vista previa de la fotografía" />
        <PrimaryButton label="Usar esta fotografía" onPress={() => onCaptured(preview, moment)} />
        <PrimaryButton label="Volver a tomar" onPress={() => setPreview(null)} />
      </View>
    );
  }

  return (
    <View style={styles.box}>
      <View style={styles.cameraFrame}>
        <CameraView ref={cameraRef} style={styles.camera} facing="back" onMountError={() => setError('No se pudo iniciar la cámara.')} />
      </View>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <Text style={styles.message}>Foto {moment === 'antes' ? 'ANTES' : 'DESPUÉS'} del servicio.</Text>
      <PrimaryButton label="Tomar fotografía" onPress={() => void takePhoto()} loading={busy} />
      {onCancel ? <PrimaryButton label="Cancelar" onPress={onCancel} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing.md },
  cameraFrame: { height: 360, borderRadius: 20, overflow: 'hidden', backgroundColor: colors.navy },
  camera: { flex: 1 },
  preview: { width: '100%', height: 360, borderRadius: 20, backgroundColor: colors.surfaceSubtle },
  message: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
});
