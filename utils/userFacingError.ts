const ERROR_TRANSLATIONS: Record<string, string> = {
  'A customer account already exists for this phone number.': 'Ya existe una cuenta de cliente con este número de teléfono.',
  'An unexpected authentication error occurred.': 'Ocurrió un error inesperado de autenticación.',
  'A payment id is required.': 'Se requiere un identificador de pago.',
  'A reservation id is required.': 'Se requiere un identificador de reservación.',
  'Choose a permitted vehicle type.': 'Selecciona un tipo de vehículo permitido.',
  'Complete all vehicle fields with a valid year.': 'Completa todos los campos del vehículo con un año válido.',
  'Invalid phone or password.': 'El teléfono o la contraseña no son válidos.',
  'Invalid authentication role.': 'El rol de autenticación no es válido.',
  'Invalid registration profile.': 'El perfil de registro no es válido.',
  'Network unavailable': 'La red no está disponible.',
  'Registration did not return a profile.': 'El registro no devolvió un perfil.',
  'The administrator request could not be completed.': 'No se pudo completar la solicitud de administración.',
  'The administrator dashboard response is empty.': 'La respuesta del panel de administración está vacía.',
  'The administrator service response is empty.': 'La respuesta del servicio de administración está vacía.',
  'The administrator washing space response is empty.': 'La respuesta del espacio de lavado está vacía.',
  'The payment history response is invalid.': 'La respuesta del historial de pagos no es válida.',
  'The payment method is not allowed.': 'El método de pago no está permitido.',
  'The payment request could not be completed.': 'No se pudo completar la solicitud de pago.',
  'The payment response is invalid.': 'La respuesta del pago no es válida.',
  'The payment result is invalid.': 'El resultado del pago no es válido.',
  'The payment to process is invalid.': 'El pago que se intenta procesar no es válido.',
  'The reservation request could not be completed.': 'No se pudo completar la solicitud de reservación.',
  'The reservation could not be found.': 'No se encontró la reservación.',
  'The reservation response has an invalid status.': 'La respuesta de la reservación contiene un estado no válido.',
  'The selected time or washing space is occupied.': 'El horario o el espacio de lavado seleccionado está ocupado.',
  'The selected time is occupied.': 'El horario seleccionado está ocupado.',
  'The sandbox payment provider returned an invalid result.': 'El proveedor de pagos del entorno de prueba devolvió un resultado no válido.',
  'The service is referenced by an existing reservation.': 'El servicio está asociado a una reservación existente.',
  'The vehicle could not be found.': 'No se encontró el vehículo.',
  'The selected vehicle is not available.': 'El vehículo seleccionado ya no está disponible.',
  'This vehicle has active reservations. Cancel them or wait until they finish before deleting it.': 'Este vehículo tiene reservaciones activas. Cancélalas o espera a que terminen para eliminarlo.',
  'The vehicle cannot be deleted because it is linked to a reservation.': 'El vehículo no se puede eliminar porque está asociado a una reservación.',
  'The reservation could not be cancelled.': 'No se pudo cancelar la reservación.',
  'The vehicle request could not be completed.': 'No se pudo completar la solicitud del vehículo.',
  'The washing space is referenced by operational records.': 'El espacio de lavado está asociado a registros operativos.',
  'This reservation cannot be cancelled.': 'Esta reservación no se puede cancelar.',
  'Your session has expired. Sign in again.': 'Tu sesión expiró. Inicia sesión nuevamente.',
};

function extractErrorMessage(error: unknown): string | null {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' && error.message) {
    return error.message;
  }
  return null;
}

export function getUserFacingErrorMessage(error: unknown, fallback: string): string {
  const message = extractErrorMessage(error);
  if (!message) {
    return fallback;
  }
  if (message.startsWith('The sandbox payment provider failed:') || message.toLowerCase().includes('sandbox')) {
    return 'No se pudo procesar el pago en el entorno de prueba.';
  }
  if (message.startsWith('The administrator response has an invalid ')) {
    return 'La respuesta de administración contiene datos no válidos.';
  }
  if (message.startsWith('The administrator ') && message.endsWith(' is required.')) {
    return 'Completa los datos obligatorios de administración.';
  }
  if (message.startsWith('The administrator ') && message.includes(' must be ')) {
    return 'Los datos de administración no son válidos.';
  }
  if (message.startsWith('The reservation ') && message.endsWith(' is required.')) {
    return 'Completa los datos obligatorios de la reservación.';
  }
  if (message.startsWith('The reservation response has an invalid ')) {
    return 'La respuesta de la reservación contiene datos no válidos.';
  }
  return ERROR_TRANSLATIONS[message] ?? message;
}
