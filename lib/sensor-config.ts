export interface SensorDisplayOptions {
  showPoint: boolean
  showLabel: boolean
  showFov: boolean
}

export interface Sensor {
  id: string
  name: string
  type: 'lidar' | 'camera' | 'radar'
  x: number  // position relative to baselink (meters), +X = front
  y: number  // position relative to baselink (meters), +Y = left
  yaw: number  // rotation in degrees (0 = +X/front, 90 = +Y/left, -90 = -Y/right)
  range: number  // detection range in meters
  fov: number  // field of view in degrees
  display: SensorDisplayOptions
}

export interface CarDimensions {
  length: number  // meters
  width: number   // meters
  wheelbase: number  // meters (front to rear axle)
  frontOverhang: number  // meters
  rearOverhang: number   // meters
}

// Car model center offset from baselink (baselink is always at origin)
export interface CarOffset {
  x: number  // offset in X direction (+ = forward from baselink)
  y: number  // offset in Y direction (+ = left from baselink)
}

export const defaultCarDimensions: CarDimensions = {
  length: 4.5,
  width: 1.8,
  wheelbase: 2.7,
  frontOverhang: 0.9,
  rearOverhang: 0.9,
}

export const defaultCarOffset: CarOffset = {
  x: 1.35,  // baselink is at rear axle, car center is wheelbase/2 forward
  y: 0,
}

export const defaultDisplayOptions: SensorDisplayOptions = {
  showPoint: true,
  showLabel: true,
  showFov: true,
}

// Default sensors positioned relative to baselink (rear axle center)
// +X = front, +Y = left
// Car length: 4.5m, wheelbase: 2.7m, front overhang: 0.9m, rear overhang: 0.9m
// So car front is at x = wheelbase + front_overhang = 2.7 + 0.9 = 3.6m from baselink
// Car rear is at x = -rear_overhang = -0.9m from baselink
export const defaultSensors: Sensor[] = [
  {
    id: 'front_lidar',
    name: 'Front LiDAR',
    type: 'lidar',
    x: 3.6,      // at car front
    y: 0,
    yaw: 0,      // facing front (+X)
    range: 100,
    fov: 120,
    display: { ...defaultDisplayOptions },
  },
  {
    id: 'front_left_camera',
    name: 'Front Left Camera',
    type: 'camera',
    x: 3.2,
    y: 0.8,      // left side
    yaw: 30,     // facing front-left
    range: 80,
    fov: 60,
    display: { ...defaultDisplayOptions },
  },
  {
    id: 'front_right_camera',
    name: 'Front Right Camera',
    type: 'camera',
    x: 3.2,
    y: -0.8,     // right side
    yaw: -30,    // facing front-right
    range: 80,
    fov: 60,
    display: { ...defaultDisplayOptions },
  },
  {
    id: 'left_radar',
    name: 'Left Radar',
    type: 'radar',
    x: 1.35,     // at car center
    y: 0.9,      // left side
    yaw: 90,     // facing left (+Y)
    range: 100,
    fov: 90,
    display: { ...defaultDisplayOptions },
  },
  {
    id: 'right_radar',
    name: 'Right Radar',
    type: 'radar',
    x: 1.35,     // at car center
    y: -0.9,     // right side
    yaw: -90,    // facing right (-Y)
    range: 100,
    fov: 90,
    display: { ...defaultDisplayOptions },
  },
  {
    id: 'rear_lidar',
    name: 'Rear LiDAR',
    type: 'lidar',
    x: -0.9,     // at car rear
    y: 0,
    yaw: 180,    // facing rear (-X)
    range: 80,
    fov: 120,
    display: { ...defaultDisplayOptions },
  },
]

export type SensorStatus = Record<string, boolean>

// Selection can be a sensor or the car
export type SelectionType = 
  | { type: 'sensor'; sensor: Sensor }
  | { type: 'car' }
  | null

// Helper to create a new sensor with defaults
export function createNewSensor(
  type: Sensor['type'],
  name: string,
  existingSensors: Sensor[]
): Sensor {
  // Generate unique ID
  const baseId = name.toLowerCase().replace(/\s+/g, '_')
  let id = baseId
  let counter = 1
  while (existingSensors.some(s => s.id === id)) {
    id = `${baseId}_${counter}`
    counter++
  }

  const defaults: Record<Sensor['type'], Partial<Sensor>> = {
    lidar: { range: 100, fov: 120, yaw: 0 },
    camera: { range: 80, fov: 60, yaw: 0 },
    radar: { range: 100, fov: 90, yaw: 0 },
  }

  return {
    id,
    name,
    type,
    x: 0,
    y: 0,
    yaw: defaults[type].yaw ?? 0,
    range: defaults[type].range ?? 100,
    fov: defaults[type].fov ?? 90,
    display: { ...defaultDisplayOptions },
  }
}

// Helper to get initial sensor status from sensors array
export function getInitialSensorStatus(sensors: Sensor[]): SensorStatus {
  const status: SensorStatus = {}
  sensors.forEach(s => {
    status[s.id] = true
  })
  return status
}
