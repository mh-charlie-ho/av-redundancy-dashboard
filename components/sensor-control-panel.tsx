'use client'

import { useState, useEffect } from 'react'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { NumericInput } from '@/components/numeric-input'
import type { Sensor, SensorStatus, CarDimensions, CarOffset, SelectionType, SensorDisplayOptions } from '@/lib/sensor-config'
import { createNewSensor, defaultCarOffset } from '@/lib/sensor-config'
import { cn } from '@/lib/utils'
import { Plus, Trash2, ChevronDown, ChevronUp, RotateCcw, Crosshair, Car, Eye, EyeOff, GripVertical } from 'lucide-react'
import type { ViewState } from './sensor-visualization'

// dnd-kit imports
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// Global display settings type
interface GlobalDisplaySettings {
  enabled: boolean
  showPoints: boolean
  showLabels: boolean
  showFovs: boolean
}

interface SensorControlPanelProps {
  sensors: Sensor[]
  sensorStatus: SensorStatus
  selection: SelectionType
  carDimensions: CarDimensions
  carOffset: CarOffset
  viewState: ViewState | null
  globalDisplay: GlobalDisplaySettings
  onToggle: (id: string) => void
  onCarDimensionsChange: (dimensions: CarDimensions) => void
  onCarOffsetChange: (offset: CarOffset) => void
  onSensorUpdate: (id: string, updates: Partial<Sensor>) => void
  onSensorAdd: (sensor: Sensor) => void
  onSensorDelete: (id: string) => void
  onDeleteAllSensors: () => void
  onSelectionChange: (selection: SelectionType) => void
  onResetView: () => void
  onCenterView: () => void
  onGlobalDisplayChange: (settings: GlobalDisplaySettings) => void
  onSensorsReorder: (sensors: Sensor[]) => void
}

function getSensorTypeInfo(type: Sensor['type']) {
  switch (type) {
    case 'lidar':
      return { color: 'bg-green-500', label: 'LiDAR' }
    case 'camera':
      return { color: 'bg-blue-500', label: 'Camera' }
    case 'radar':
      return { color: 'bg-purple-500', label: 'Radar' }
  }
}

// Sortable sensor item component
interface SortableSensorItemProps {
  sensor: Sensor
  alive: boolean
  isSelected: boolean
  isExpanded: boolean
  globalDisplay: GlobalDisplaySettings
  onHeaderClick: (sensor: Sensor) => void
  onToggle: (id: string) => void
  onSensorUpdate: (id: string, updates: Partial<Sensor>) => void
  onSensorDelete: (id: string) => void
  onDisplayOptionChange: (sensorId: string, key: keyof SensorDisplayOptions, value: boolean) => void
}

function SortableSensorItem({
  sensor,
  alive,
  isSelected,
  isExpanded,
  globalDisplay,
  onHeaderClick,
  onToggle,
  onSensorUpdate,
  onSensorDelete,
  onDisplayOptionChange,
}: SortableSensorItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sensor.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 100 : 'auto',
  }

  const typeInfo = getSensorTypeInfo(sensor.type)

  // Check if individual options should be disabled
  const isPointDisabled = !globalDisplay.enabled || !globalDisplay.showPoints
  const isLabelDisabled = !globalDisplay.enabled || !globalDisplay.showLabels
  const isFovDisabled = !globalDisplay.enabled || !globalDisplay.showFovs
  const isAllDisabled = !globalDisplay.enabled

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'rounded-lg border transition-all duration-200',
        isDragging && 'shadow-lg shadow-primary/20',
        isSelected
          ? 'bg-yellow-500/10 border-yellow-500/30'
          : alive
            ? 'bg-card border-border hover:border-muted-foreground/30'
            : 'bg-red-500/5 border-red-500/20'
      )}
    >
      {/* Sensor header row */}
      <div className="flex items-center justify-between p-2">
        {/* Drag handle */}
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 -ml-1 mr-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </div>

        <div
          className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer"
          onClick={() => onHeaderClick(sensor)}
        >
          <div className="p-0.5">
            {isExpanded ? (
              <ChevronUp className="h-3 w-3 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            )}
          </div>
          <div
            className={cn(
              'w-2 h-2 rounded-full flex-shrink-0 transition-colors duration-200',
              alive ? typeInfo.color : 'bg-red-500'
            )}
          />
          <div className="min-w-0 flex-1">
            <div className={cn(
              'font-medium text-xs truncate transition-colors duration-200',
              isSelected ? 'text-yellow-400' : alive ? 'text-foreground' : 'text-red-400'
            )}>
              {sensor.name}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {sensor.fov}deg / {sensor.range}m
            </div>
          </div>
        </div>
        <Switch
          checked={alive}
          onCheckedChange={() => onToggle(sensor.id)}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Toggle ${sensor.name}`}
          className="flex-shrink-0"
        />
      </div>

      {/* Expanded settings panel */}
      {isExpanded && (
        <div className="px-3 pb-3 pt-0 space-y-3 border-t border-border/50">
          {/* Position relative to baselink */}
          <div className="grid grid-cols-2 gap-2 pt-3">
            <div className="bg-background/50 rounded p-2">
              <div className="text-[10px] text-muted-foreground mb-1">Position X</div>
              <div className="flex items-center gap-1">
                <NumericInput
                  value={sensor.x}
                  onChange={(val) => onSensorUpdate(sensor.id, { x: val })}
                  onClick={(e) => e.stopPropagation()}
                />
                <span className="text-xs text-muted-foreground">m</span>
              </div>
            </div>
            <div className="bg-background/50 rounded p-2">
              <div className="text-[10px] text-muted-foreground mb-1">Position Y</div>
              <div className="flex items-center gap-1">
                <NumericInput
                  value={sensor.y}
                  onChange={(val) => onSensorUpdate(sensor.id, { y: val })}
                  onClick={(e) => e.stopPropagation()}
                />
                <span className="text-xs text-muted-foreground">m</span>
              </div>
            </div>
          </div>

          {/* FOV and Range */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-background/50 rounded p-2">
              <div className="text-[10px] text-muted-foreground mb-1">FOV</div>
              <div className="flex items-center gap-1">
                <NumericInput
                  value={sensor.fov}
                  onChange={(val) => onSensorUpdate(sensor.id, { fov: val })}
                  onClick={(e) => e.stopPropagation()}
                  allowNegative={false}
                  decimals={0}
                />
                <span className="text-xs text-muted-foreground">deg</span>
              </div>
            </div>
            <div className="bg-background/50 rounded p-2">
              <div className="text-[10px] text-muted-foreground mb-1">Range</div>
              <div className="flex items-center gap-1">
                <NumericInput
                  value={sensor.range}
                  onChange={(val) => onSensorUpdate(sensor.id, { range: val })}
                  onClick={(e) => e.stopPropagation()}
                  allowNegative={false}
                  decimals={0}
                />
                <span className="text-xs text-muted-foreground">m</span>
              </div>
            </div>
          </div>

          {/* Yaw angle */}
          <div className="bg-background/50 rounded p-2">
            <div className="text-[10px] text-muted-foreground mb-1">Yaw Angle</div>
            <div className="flex items-center gap-1">
              <NumericInput
                value={sensor.yaw}
                onChange={(val) => onSensorUpdate(sensor.id, { yaw: val })}
                onClick={(e) => e.stopPropagation()}
                decimals={0}
              />
              <span className="text-xs text-muted-foreground">deg</span>
            </div>
                    <div className="text-[9px] text-muted-foreground mt-1">
                      0 = +X (front), 90 = +Y (left), -90 = -Y (right)
                    </div>
          </div>

          {/* Display options - with individual graying */}
          <div className="bg-background/50 rounded p-2">
            <div className="text-[10px] text-muted-foreground uppercase mb-2 flex items-center justify-between">
              <span>Display Options</span>
              {isAllDisabled && (
                <span className="text-yellow-500/70 normal-case">(Global off)</span>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <label 
                className={cn(
                  "flex items-center justify-between text-xs transition-opacity",
                  isPointDisabled && "opacity-40 pointer-events-none"
                )} 
                onClick={(e) => e.stopPropagation()}
              >
                <span>Show Point</span>
                <Switch
                  checked={sensor.display.showPoint}
                  onCheckedChange={(checked) => onDisplayOptionChange(sensor.id, 'showPoint', checked)}
                  className="scale-75"
                />
              </label>
              <label 
                className={cn(
                  "flex items-center justify-between text-xs transition-opacity",
                  isLabelDisabled && "opacity-40 pointer-events-none"
                )} 
                onClick={(e) => e.stopPropagation()}
              >
                <span>Show Label</span>
                <Switch
                  checked={sensor.display.showLabel}
                  onCheckedChange={(checked) => onDisplayOptionChange(sensor.id, 'showLabel', checked)}
                  className="scale-75"
                />
              </label>
              <label 
                className={cn(
                  "flex items-center justify-between text-xs transition-opacity",
                  isFovDisabled && "opacity-40 pointer-events-none"
                )} 
                onClick={(e) => e.stopPropagation()}
              >
                <span>Show FOV</span>
                <Switch
                  checked={sensor.display.showFov}
                  onCheckedChange={(checked) => onDisplayOptionChange(sensor.id, 'showFov', checked)}
                  className="scale-75"
                />
              </label>
            </div>
          </div>

          {/* Delete button */}
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs text-red-400 hover:text-red-300 hover:bg-red-500/20"
            onClick={(e) => {
              e.stopPropagation()
              onSensorDelete(sensor.id)
            }}
          >
            <Trash2 className="h-3 w-3 mr-1" />
            Delete Sensor
          </Button>
        </div>
      )}
    </div>
  )
}

export function SensorControlPanel({
  sensors,
  sensorStatus,
  selection,
  carDimensions,
  carOffset,
  viewState,
  globalDisplay,
  onToggle,
  onCarDimensionsChange,
  onCarOffsetChange,
  onSensorUpdate,
  onSensorAdd,
  onSensorDelete,
  onDeleteAllSensors,
  onSelectionChange,
  onResetView,
  onCenterView,
  onGlobalDisplayChange,
  onSensorsReorder,
}: SensorControlPanelProps) {
  // Ensure carOffset has values (fallback for old localStorage data)
  const safeCarOffset = carOffset?.x !== undefined ? carOffset : defaultCarOffset
  
  const aliveCount = sensors.filter((s) => sensorStatus[s.id] !== false).length
  const totalCount = sensors.length

  const [showAddSensor, setShowAddSensor] = useState(false)
  const [newSensorName, setNewSensorName] = useState('')
  const [newSensorType, setNewSensorType] = useState<Sensor['type']>('lidar')
  const [expandedSensorId, setExpandedSensorId] = useState<string | null>(null)
  const [showCarSettings, setShowCarSettings] = useState(false)
  const [showDisplayOptions, setShowDisplayOptions] = useState(true)

  const selectedSensor = selection?.type === 'sensor' ? selection.sensor : null
  const isCarSelected = selection?.type === 'car'

  // dnd-kit sensors
  const dndSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Sync expanded state when selection changes from visualization
  useEffect(() => {
    if (selectedSensor) {
      setExpandedSensorId(selectedSensor.id)
    }
    if (isCarSelected) {
      setShowCarSettings(true)
    }
  }, [selectedSensor?.id, isCarSelected])

  const getSystemStatus = () => {
    const ratio = aliveCount / totalCount
    if (ratio >= 0.8) return { label: 'NORMAL', color: 'text-green-400', bgColor: 'bg-green-500/10 border-green-500/30' }
    if (ratio >= 0.4) return { label: 'DEGRADED', color: 'text-yellow-400', bgColor: 'bg-yellow-500/10 border-yellow-500/30' }
    return { label: 'CRITICAL', color: 'text-red-400', bgColor: 'bg-red-500/10 border-red-500/30' }
  }

  const status = getSystemStatus()

  const handleAddSensor = () => {
    if (!newSensorName.trim()) return
    const newSensor = createNewSensor(newSensorType, newSensorName.trim(), sensors)
    onSensorAdd(newSensor)
    setNewSensorName('')
    setShowAddSensor(false)
  }

  const handleDisplayOptionChange = (sensorId: string, key: keyof SensorDisplayOptions, value: boolean) => {
    const sensor = sensors.find(s => s.id === sensorId)
    if (!sensor) return
    onSensorUpdate(sensorId, {
      display: { ...sensor.display, [key]: value }
    })
  }

  // Toggle expand/collapse for sensor settings
  const handleSensorHeaderClick = (sensor: Sensor) => {
    // Always select this sensor
    onSelectionChange({ type: 'sensor', sensor })
    // Toggle expand - independent of selection
    if (expandedSensorId === sensor.id) {
      setExpandedSensorId(null)
    } else {
      setExpandedSensorId(sensor.id)
    }
  }

  // Handle drag end
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = sensors.findIndex((s) => s.id === active.id)
      const newIndex = sensors.findIndex((s) => s.id === over.id)
      const newSensors = arrayMove(sensors, oldIndex, newIndex)
      onSensorsReorder(newSensors)
    }
  }

  return (
    <div className="flex flex-col gap-3 h-full overflow-y-auto pr-1">
      {/* View Controls */}
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
          View Controls
        </div>
        <div className="flex gap-2 mb-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 text-xs"
            onClick={onCenterView}
          >
            <Crosshair className="h-3.5 w-3.5 mr-1" />
            Center
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1 text-xs"
            onClick={onResetView}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            Reset
          </Button>
        </div>
        {viewState && (
          <div className="grid grid-cols-3 gap-2 text-[10px] text-muted-foreground">
            <div className="bg-background/50 rounded p-1.5 text-center">
              <div className="font-medium text-foreground">{(viewState.zoom * 100).toFixed(0)}%</div>
              <div>Zoom</div>
            </div>
            <div className="bg-background/50 rounded p-1.5 text-center">
              <div className="font-medium text-foreground">{viewState.panX.toFixed(0)}</div>
              <div>Pan X</div>
            </div>
            <div className="bg-background/50 rounded p-1.5 text-center">
              <div className="font-medium text-foreground">{viewState.panY.toFixed(0)}</div>
              <div>Pan Y</div>
            </div>
          </div>
        )}
      </div>

      {/* System Status */}
      <div className={cn('rounded-lg border p-3', status.bgColor)}>
        <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
          System Status
        </div>
        <div className={cn('text-xl font-bold', status.color)}>
          {status.label}
        </div>
        <div className="text-sm text-muted-foreground">
          {aliveCount}/{totalCount} sensors active
        </div>
      </div>

      {/* Vehicle Settings (collapsible) */}
      <div className={cn(
        'rounded-lg border p-3 transition-colors',
        isCarSelected ? 'border-yellow-500/30 bg-yellow-500/5' : 'border-border bg-card'
      )}>
        <button
          onClick={() => {
            setShowCarSettings(!showCarSettings)
            if (!showCarSettings) {
              onSelectionChange({ type: 'car' })
            }
          }}
          className="w-full flex items-center justify-between text-xs text-muted-foreground uppercase tracking-wider"
        >
          <span className="flex items-center gap-2">
            <Car className="h-3.5 w-3.5" />
            Vehicle Settings
            {isCarSelected && (
              <Badge variant="outline" className="text-yellow-400 border-yellow-500/30 text-[9px] px-1.5 py-0">
                Selected
              </Badge>
            )}
          </span>
          <span>{showCarSettings ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}</span>
        </button>

        {showCarSettings && (
          <div className="mt-3 space-y-3">
            {/* Baselink info - always at origin */}
            <div className="bg-background/50 rounded p-2 text-center">
              <div className="text-[10px] text-muted-foreground">Baselink (Origin)</div>
              <div className="text-xs font-medium">(0, 0)</div>
            </div>

            {/* Car model offset from baselink */}
            <div>
              <div className="text-[10px] text-muted-foreground mb-2">Car Model Offset from Baselink</div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-background/50 rounded p-2">
                  <div className="text-[10px] text-muted-foreground mb-1">X (Forward)</div>
                  <div className="flex items-center gap-1">
                    <NumericInput
                      value={safeCarOffset.x}
                      onChange={(val) => onCarOffsetChange({ ...safeCarOffset, x: val })}
                    />
                    <span className="text-xs text-muted-foreground">m</span>
                  </div>
                </div>
                <div className="bg-background/50 rounded p-2">
                  <div className="text-[10px] text-muted-foreground mb-1">Y (Left)</div>
                  <div className="flex items-center gap-1">
                    <NumericInput
                      value={safeCarOffset.y}
                      onChange={(val) => onCarOffsetChange({ ...safeCarOffset, y: val })}
                    />
                    <span className="text-xs text-muted-foreground">m</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Vehicle dimensions */}
            <div>
              <div className="text-[10px] text-muted-foreground mb-2">Vehicle Dimensions</div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-background/50 rounded p-2">
                  <div className="text-[10px] text-muted-foreground mb-1">Length</div>
                  <div className="flex items-center gap-1">
                    <NumericInput
                      value={carDimensions.length}
                      onChange={(val) => onCarDimensionsChange({ ...carDimensions, length: val })}
                      allowNegative={false}
                    />
                    <span className="text-xs text-muted-foreground">m</span>
                  </div>
                </div>
                <div className="bg-background/50 rounded p-2">
                  <div className="text-[10px] text-muted-foreground mb-1">Width</div>
                  <div className="flex items-center gap-1">
                    <NumericInput
                      value={carDimensions.width}
                      onChange={(val) => onCarDimensionsChange({ ...carDimensions, width: val })}
                      allowNegative={false}
                    />
                    <span className="text-xs text-muted-foreground">m</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Overhangs */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-background/50 rounded p-2">
                <div className="text-[10px] text-muted-foreground mb-1">Front Overhang</div>
                <div className="flex items-center gap-1">
                  <NumericInput
                    value={carDimensions.frontOverhang}
                    onChange={(val) => onCarDimensionsChange({ ...carDimensions, frontOverhang: val })}
                    allowNegative={false}
                  />
                  <span className="text-xs text-muted-foreground">m</span>
                </div>
              </div>
              <div className="bg-background/50 rounded p-2">
                <div className="text-[10px] text-muted-foreground mb-1">Rear Overhang</div>
                <div className="flex items-center gap-1">
                  <NumericInput
                    value={carDimensions.rearOverhang}
                    onChange={(val) => onCarDimensionsChange({ ...carDimensions, rearOverhang: val })}
                    allowNegative={false}
                  />
                  <span className="text-xs text-muted-foreground">m</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sensors section */}
      <div className="rounded-lg border border-border bg-card p-3 flex-1 min-h-0 flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">
            Sensors ({totalCount})
          </div>
          <div className="flex items-center gap-1">
            {sensors.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                onClick={onDeleteAllSensors}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Delete All
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => setShowAddSensor(true)}
            >
              <Plus className="h-3 w-3 mr-1" />
              Add
            </Button>
          </div>
        </div>

        {/* Display Options - moved under Sensors */}
        <div className="rounded border border-border/50 bg-background/30 p-2 mb-3">
          <button
            onClick={() => setShowDisplayOptions(!showDisplayOptions)}
            className="w-full flex items-center justify-between text-[10px] text-muted-foreground uppercase tracking-wider"
          >
            <span className="flex items-center gap-1.5">
              {globalDisplay.enabled ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
              Display Options
            </span>
            <span>{showDisplayOptions ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}</span>
          </button>

          {showDisplayOptions && (
            <div className="mt-2 space-y-1.5">
              <label className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Enable All</span>
                <Switch
                  checked={globalDisplay.enabled}
                  onCheckedChange={(checked) => onGlobalDisplayChange({ ...globalDisplay, enabled: checked })}
                  className="scale-75"
                />
              </label>
              <label className={cn(
                "flex items-center justify-between text-xs transition-opacity",
                !globalDisplay.enabled && "opacity-40 pointer-events-none"
              )}>
                <span className="text-muted-foreground">Show All Points</span>
                <Switch
                  checked={globalDisplay.showPoints}
                  onCheckedChange={(checked) => onGlobalDisplayChange({ ...globalDisplay, showPoints: checked })}
                  className="scale-75"
                />
              </label>
              <label className={cn(
                "flex items-center justify-between text-xs transition-opacity",
                !globalDisplay.enabled && "opacity-40 pointer-events-none"
              )}>
                <span className="text-muted-foreground">Show All Labels</span>
                <Switch
                  checked={globalDisplay.showLabels}
                  onCheckedChange={(checked) => onGlobalDisplayChange({ ...globalDisplay, showLabels: checked })}
                  className="scale-75"
                />
              </label>
              <label className={cn(
                "flex items-center justify-between text-xs transition-opacity",
                !globalDisplay.enabled && "opacity-40 pointer-events-none"
              )}>
                <span className="text-muted-foreground">Show All FOVs</span>
                <Switch
                  checked={globalDisplay.showFovs}
                  onCheckedChange={(checked) => onGlobalDisplayChange({ ...globalDisplay, showFovs: checked })}
                  className="scale-75"
                />
              </label>
            </div>
          )}
        </div>

        {/* Add sensor form */}
        {showAddSensor && (
          <div className="mb-3 p-2 bg-background/50 rounded-lg border border-border/50 space-y-2">
            <input
              type="text"
              value={newSensorName}
              onChange={(e) => setNewSensorName(e.target.value)}
              placeholder="Sensor name..."
              className="w-full px-2 py-1.5 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddSensor()
                if (e.key === 'Escape') setShowAddSensor(false)
              }}
            />
            <div className="flex gap-1">
              {(['lidar', 'camera', 'radar'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setNewSensorType(type)}
                  className={cn(
                    'flex-1 px-2 py-1 text-[10px] rounded transition-colors',
                    newSensorType === type
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background/50 text-muted-foreground hover:bg-background'
                  )}
                >
                  {type.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1 h-7 text-xs"
                onClick={handleAddSensor}
                disabled={!newSensorName.trim()}
              >
                Add
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setShowAddSensor(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Sensor list with drag and drop */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          <div className="text-[9px] text-muted-foreground mb-1 text-center">
            Drag to reorder (top = front, bottom = back)
          </div>
          <DndContext
            sensors={dndSensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sensors.map(s => s.id)}
              strategy={verticalListSortingStrategy}
            >
              {sensors.map((sensor) => (
                <SortableSensorItem
                  key={sensor.id}
                  sensor={sensor}
                  alive={sensorStatus[sensor.id] !== false}
                  isSelected={selectedSensor?.id === sensor.id}
                  isExpanded={expandedSensorId === sensor.id}
                  globalDisplay={globalDisplay}
                  onHeaderClick={handleSensorHeaderClick}
                  onToggle={onToggle}
                  onSensorUpdate={onSensorUpdate}
                  onSensorDelete={onSensorDelete}
                  onDisplayOptionChange={handleDisplayOptionChange}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      </div>
    </div>
  )
}
