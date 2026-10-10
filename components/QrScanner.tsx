import React, { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { PrimaryButton } from './PrimaryButton';
import { colors, spacing } from '../constants/theme';

interface QrScannerProps {
  onScanned: (value: string) => void;
  onCancel?: () => void;
}

export function QrScanner({ onScanned, onCancel }: QrScannerProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraError, setCameraError] = useState<string | null>(null);
  const handled = useRef(false);

  if (!permission) {
    return <Text style={styles.message}>Comprobando permiso de cámara…</Text>;
  }

  if (!permission.granted) {
    return (
      <View style={styles.box}>
        <Text style={styles.message}>
          {permission.canAskAgain
            ? 'Necesitamos acceso a la cámara para leer el código QR.'
            : 'El permiso de cámara está denegado. Actívalo en los ajustes del teléfono.'}
        </Text>
        {permission.canAskAgain ? (
          <PrimaryButton label="Permitir cámara" onPress={() => void requestPermission()} />
        ) : null}
        {onCancel ? <PrimaryButton label="Cerrar" onPress={onCancel} /> : null}
      </View>
    );
  }

  return (
    <View style={styles.box}>
      <View style={styles.cameraFrame}>
        <CameraView
          style={styles.camera}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onMountError={() => setCameraError('No se pudo iniciar la cámara.')}
          onBarcodeScanned={({ data }) => {
            if (handled.current || !data) {
              return;
            }
            handled.current = true;
            onScanned(data.trim());
          }}
        />
      </View>
      {cameraError ? <Text accessibilityRole="alert" style={styles.error}>{cameraError}</Text> : null}
      <Text style={styles.message}>Apunta la cámara al código QR de tu reservación.</Text>
      {onCancel ? <PrimaryButton label="Cancelar" onPress={onCancel} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing.md },
  cameraFrame: { height: 300, borderRadius: 20, overflow: 'hidden', backgroundColor: colors.navy },
  camera: { flex: 1 },
  message: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
});
