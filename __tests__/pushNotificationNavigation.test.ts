import { getPushNotificationDestination } from '../utils/pushNotificationNavigation';

describe('push notification navigation', () => {
  it('opens reservation notifications in the reservation detail', () => {
    expect(getPushNotificationDestination({ reservationId: 'reservation-1' })).toEqual({
      pathname: '/reservacion/[id]',
      params: { id: 'reservation-1' },
    });
  });

  it('opens new service and car wash notifications in the catalog detail', () => {
    expect(getPushNotificationDestination({
      notificationType: 'new_service',
      serviceId: 'service-1',
      autolavadoId: 'wash-1',
    })).toEqual({
      pathname: '/autolavado/[id]',
      params: { id: 'wash-1' },
    });
    expect(getPushNotificationDestination({
      notificationType: 'new_carwash',
      autolavadoId: 'wash-2',
    })).toEqual({
      pathname: '/autolavado/[id]',
      params: { id: 'wash-2' },
    });
  });

  it('ignores malformed or unrelated notification data', () => {
    expect(getPushNotificationDestination(null)).toBeNull();
    expect(getPushNotificationDestination({ notificationType: 'new_service' })).toBeNull();
    expect(getPushNotificationDestination({ notificationType: 'unknown', autolavadoId: 'wash-1' })).toBeNull();
  });
});
