import { createElement } from 'react';
import { act, create } from 'react-test-renderer';

import {
  AlertVehicleType,
  configure,
  logout,
  onLocation,
  setExtraBodyFields,
  setExtraHeaders,
  setMutedAlertTypes,
  setSegmentUrl,
  setVoiceMode,
  setVoiceSpeed,
  useNavSpeedAlertSigns,
  VoiceAlertType,
  VoiceMode,
} from '../index';

type Listener = (event: any) => void;

jest.mock('../NavSpeedAlertModule', () => {
  const listeners: Record<string, Listener[]> = {};
  return {
    __esModule: true,
    default: {
      configure: jest.fn(() => null),
      logout: jest.fn(),
      setSegmentUrl: jest.fn(() => null),
      setExtraHeaders: jest.fn(() => null),
      setExtraBodyFields: jest.fn(() => null),
      start: jest.fn(),
      onLocation: jest.fn(),
      reset: jest.fn(),
      setMutedAlertTypes: jest.fn(),
      setVoiceMode: jest.fn(),
      setVoiceSpeed: jest.fn(),
      addListener: jest.fn((eventName: string, listener: Listener) => {
        (listeners[eventName] ??= []).push(listener);
        return {
          remove: () => {
            listeners[eventName] = listeners[eventName].filter((l) => l !== listener);
          },
        };
      }),
      emit: (eventName: string, event: unknown) =>
        (listeners[eventName] ?? []).forEach((listener) => listener(event)),
      listenerCount: (eventName: string) => (listeners[eventName] ?? []).length,
    },
  };
});

const nativeModule = jest.requireMock('../NavSpeedAlertModule').default;

const configureOptions = {
  baseUrl: 'https://example.invalid',
  apiKeyId: 'id',
  apiKey: 'key',
  identity: '+84901234567',
  vehicleType: AlertVehicleType.TRUCK,
  seats: 4,
  weightsTons: 1.5,
  maxSnapMeters: 0,
};

const nativeConfigureOptions = { ...configureOptions, metadata: null };

function signRef() {
  return { release: jest.fn() };
}

beforeEach(() => jest.clearAllMocks());

describe('configure', () => {
  it('forwards https options to native with metadata serialised', async () => {
    await configure({ ...configureOptions, metadata: { vehicleId: '29A-12345' } });
    expect(nativeModule.configure).toHaveBeenCalledWith({
      ...nativeConfigureOptions,
      metadata: '{"vehicleId":"29A-12345"}',
    });
  });

  it('passes a missing metadata as null', async () => {
    await configure(configureOptions);
    expect(nativeModule.configure).toHaveBeenCalledWith(nativeConfigureOptions);
  });

  it('sends the server vehicle number', async () => {
    await configure({ ...configureOptions, vehicleType: AlertVehicleType.MOTORCYCLE });
    expect(nativeModule.configure).toHaveBeenCalledWith(
      expect.objectContaining({ vehicleType: 7 })
    );
  });

  it('reaches native synchronously, in call order with the fixes that follow', () => {
    const first = configure(configureOptions);
    const second = configure({ ...configureOptions, identity: '+84900000000' });
    onLocation({ lat: 21, lng: 105, bearing: 0, speedKmh: 0, accuracy: 5, fixTimeMillis: 1 });

    const [configureA, configureB] = nativeModule.configure.mock.invocationCallOrder;
    const [fix] = nativeModule.onLocation.mock.invocationCallOrder;
    expect(configureA).toBeLessThan(configureB);
    expect(configureB).toBeLessThan(fix);
    return Promise.all([first, second]);
  });

  it('turns a native throw into a rejection', async () => {
    nativeModule.configure.mockImplementationOnce(() => {
      throw new Error('Could not resolve the host application id.');
    });
    await expect(configure(configureOptions)).rejects.toThrow(
      'Could not resolve the host application id.'
    );
  });

  it('rejects with the native reason when native refuses the configuration', async () => {
    nativeModule.configure.mockReturnValueOnce('identity must not be empty');
    await expect(configure({ ...configureOptions, identity: '' })).rejects.toThrow(
      'NavSpeedAlert.configure: identity must not be empty'
    );
  });

  it('accepts an upper-case https scheme like native does', async () => {
    await configure({ ...configureOptions, baseUrl: 'HTTPS://example.invalid' });
    expect(nativeModule.configure).toHaveBeenCalledTimes(1);
  });

  it('rejects a non-https baseUrl without calling native', async () => {
    await expect(
      configure({ ...configureOptions, baseUrl: 'http://example.invalid' })
    ).rejects.toThrow(/https/);
    expect(nativeModule.configure).not.toHaveBeenCalled();
  });

  it.each([
    ['vehicleType', { vehicleType: Number.NaN }],
    ['vehicleType outside AlertVehicleType', { vehicleType: 6 }],
    ['seats', { seats: 4.5 }],
    ['weightsTons', { weightsTons: Number.POSITIVE_INFINITY }],
    ['maxSnapMeters', { maxSnapMeters: Number.NaN }],
  ])('rejects an invalid %s without calling native', async (_, override) => {
    await expect(configure({ ...configureOptions, ...override })).rejects.toThrow(TypeError);
    expect(nativeModule.configure).not.toHaveBeenCalled();
  });
});

describe('logout', () => {
  function answer(requestId: number, result = { success: true, errorCode: 0, errorMessage: '' }) {
    nativeModule.emit('onLogoutResult', { requestId, ...result });
  }

  it('resolves with the native answer to its own request, failure included', async () => {
    const loggedOut = logout();
    const [requestId] = nativeModule.logout.mock.calls[0];
    const failure = { success: false, errorCode: -4, errorMessage: 'Server unreachable.' };

    answer(requestId + 1000);
    answer(requestId, failure);

    await expect(loggedOut).resolves.toEqual(failure);
    expect(nativeModule.listenerCount('onLogoutResult')).toBe(0);
  });

  it('gives each call its own request id', async () => {
    const first = logout();
    const second = logout();
    const [[firstId], [secondId]] = nativeModule.logout.mock.calls;
    expect(firstId).not.toBe(secondId);

    answer(secondId);
    answer(firstId, { success: false, errorCode: -8, errorMessage: 'Device not ready.' });
    await expect(first).resolves.toMatchObject({ errorCode: -8 });
    await expect(second).resolves.toMatchObject({ success: true });
  });

  it('reaches native synchronously, so a following configure cannot overtake it', async () => {
    const loggedOut = logout();
    const configured = configure({ ...configureOptions, identity: '+84900000000' });

    const [logoutCall] = nativeModule.logout.mock.invocationCallOrder;
    const [configureCall] = nativeModule.configure.mock.invocationCallOrder;
    expect(logoutCall).toBeLessThan(configureCall);
    await configured;

    answer(nativeModule.logout.mock.calls[0][0]);
    await loggedOut;
  });

  it('rejects and unsubscribes when the native call throws', async () => {
    nativeModule.logout.mockImplementationOnce(() => {
      throw new Error('native module unavailable');
    });
    await expect(logout()).rejects.toThrow('native module unavailable');
    expect(nativeModule.listenerCount('onLogoutResult')).toBe(0);
  });
});

describe('segment request overrides', () => {
  it.each([
    ['setSegmentUrl', () => setSegmentUrl('https://proxy.invalid/route'), 'setSegmentUrl'],
    ['setExtraHeaders', () => setExtraHeaders({ 'X-Trace': '1' }), 'setExtraHeaders'],
    ['setExtraBodyFields', () => setExtraBodyFields({ fleet: 'a' }), 'setExtraBodyFields'],
  ])('%s returns normally when native accepts', (_, call, nativeName) => {
    expect(call).not.toThrow();
    expect(nativeModule[nativeName]).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['setSegmentUrl', () => setSegmentUrl('http://proxy.invalid'), 'setSegmentUrl'],
    ['setExtraHeaders', () => setExtraHeaders({ 'content-type': 'x' }), 'setExtraHeaders'],
    ['setExtraBodyFields', () => setExtraBodyFields({ identity: 'x' }), 'setExtraBodyFields'],
  ])('%s throws the native reason when native refuses', (name, call, nativeName) => {
    nativeModule[nativeName].mockReturnValueOnce('reserved key');
    expect(call).toThrow(`NavSpeedAlert.${name}: reserved key`);
  });
});

describe('native forwarding', () => {
  const fix = {
    lat: 21.1,
    lng: 105.8,
    bearing: 90,
    speedKmh: 42,
    accuracy: 5,
    fixTimeMillis: 1_700_000_000_000,
  };

  it('passes the fix fields to onLocation in native order', () => {
    onLocation(fix);
    expect(nativeModule.onLocation).toHaveBeenCalledWith(21.1, 105.8, 90, 42, 5, 1_700_000_000_000);
  });

  it('rounds a fractional fix timestamp and rejects a non-finite one', () => {
    onLocation({ ...fix, fixTimeMillis: 1_700_000_000_000.6 });
    expect(nativeModule.onLocation).toHaveBeenLastCalledWith(
      21.1,
      105.8,
      90,
      42,
      5,
      1_700_000_000_001
    );

    expect(() => onLocation({ ...fix, fixTimeMillis: Number.NaN })).toThrow(TypeError);
    expect(nativeModule.onLocation).toHaveBeenCalledTimes(1);
  });

  it('maps enums to their raw native values', () => {
    setMutedAlertTypes([VoiceAlertType.SPEED_CAMERA, VoiceAlertType.NO_STOPPING]);
    expect(nativeModule.setMutedAlertTypes).toHaveBeenCalledWith([3, 19]);

    setVoiceMode(VoiceMode.DING);
    expect(nativeModule.setVoiceMode).toHaveBeenCalledWith(1);

    setVoiceSpeed(1.5);
    expect(nativeModule.setVoiceSpeed).toHaveBeenCalledWith(1.5);
  });

  it('rejects non-integer enum values before they reach native', () => {
    expect(() => setVoiceMode(Number.NaN as VoiceMode)).toThrow(TypeError);
    expect(() => setMutedAlertTypes([Number.NaN as VoiceAlertType])).toThrow(TypeError);
    expect(nativeModule.setVoiceMode).not.toHaveBeenCalled();
    expect(nativeModule.setMutedAlertTypes).not.toHaveBeenCalled();
  });
});

describe('useNavSpeedAlertSigns', () => {
  function renderHook() {
    const result: { current: ReturnType<typeof useNavSpeedAlertSigns> | null } = { current: null };
    function Probe() {
      result.current = useNavSpeedAlertSigns();
      return null;
    }
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(createElement(Probe));
    });
    return { result, renderer };
  }

  it('releases the refs of a superseded sign tick', () => {
    const { result, renderer } = renderHook();
    const first = { current: signRef(), next: null, camera: signRef(), toll: null };
    const second = { current: signRef(), next: null, camera: null, toll: null };

    act(() => nativeModule.emit('onSigns', { ...first, speedStatus: 0 }));
    act(() => nativeModule.emit('onSigns', { ...second, speedStatus: 0 }));

    expect(result.current?.signs?.current).toBe(second.current);
    expect(first.current.release).toHaveBeenCalledTimes(1);
    expect(first.camera.release).toHaveBeenCalledTimes(1);
    expect(second.current.release).not.toHaveBeenCalled();

    act(() => renderer.unmount());
    expect(second.current.release).toHaveBeenCalledTimes(1);
  });

  it('subscribes to restrictions only while mounted', () => {
    const { result, renderer } = renderHook();
    const closed = signRef();
    expect(nativeModule.listenerCount('onRestriction')).toBe(1);

    act(() =>
      nativeModule.emit('onRestriction', {
        stop: null,
        closed,
        vehicle: null,
        bua: null,
        turn: null,
        closedDistMeters: 120,
        inBua: false,
      })
    );
    expect(result.current?.restriction?.closed).toBe(closed);

    act(() => renderer.unmount());
    expect(closed.release).toHaveBeenCalledTimes(1);
    expect(nativeModule.listenerCount('onRestriction')).toBe(0);
  });
});
