'use client'

import { useMemo, useCallback, useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
import type { Sensor, SensorStatus, CarDimensions, CarOffset, SelectionType } from '@/lib/sensor-config'
import { defaultCarDimensions, defaultCarOffset } from '@/lib/sensor-config'

export interface ViewState {
  zoom: number
  panX: number
  panY: number
}

export interface SensorVisualizationHandle {
  resetView: () => void
  centerView: () => void
  getViewState: () => ViewState
  setView: (state: ViewState) => void
}

// Global display settings type
interface GlobalDisplaySettings {
  enabled: boolean
  showPoints: boolean
  showLabels: boolean
  showFovs: boolean
}

interface SensorVisualizationProps {
  sensors: Sensor[]
  sensorStatus: SensorStatus
  carDimensions?: CarDimensions
  carOffset?: CarOffset
  globalDisplay?: GlobalDisplaySettings
  initialViewState?: ViewState
  onSensorDrag?: (id: string, x: number, y: number) => void
  onSelectionChange?: (selection: SelectionType) => void
  selection?: SelectionType
  pixelsPerMeter?: number
  onViewStateChange?: (state: ViewState) => void
}

function createFovPath(
  x: number,
  y: number,
  yaw: number,
  fov: number,
  range: number
): string {
  const halfFov = (fov / 2) * (Math.PI / 180)
  // Convert world yaw to SVG angle: world +X (front) = SVG -Y (up) = -90 deg in SVG
  // SVG angle 0 = right, 90 = down, -90 = up
  const svgYaw = -90 - yaw
  const yawRad = svgYaw * (Math.PI / 180)

  const startAngle = yawRad - halfFov
  const endAngle = yawRad + halfFov

  const startX = x + range * Math.cos(startAngle)
  const startY = y + range * Math.sin(startAngle)
  const endX = x + range * Math.cos(endAngle)
  const endY = y + range * Math.sin(endAngle)

  const largeArc = fov > 180 ? 1 : 0

  return `M ${x} ${y} L ${startX} ${startY} A ${range} ${range} 0 ${largeArc} 1 ${endX} ${endY} Z`
}

function getSensorColor(type: Sensor['type'], alive: boolean): { fill: string; stroke: string } {
  if (!alive) {
    return {
      fill: 'rgba(239, 68, 68, 0.08)',
      stroke: 'rgb(239, 68, 68)',
    }
  }

  switch (type) {
    case 'lidar':
      return {
        fill: 'rgba(34, 197, 94, 0.15)',
        stroke: 'rgb(34, 197, 94)',
      }
    case 'camera':
      return {
        fill: 'rgba(59, 130, 246, 0.15)',
        stroke: 'rgb(59, 130, 246)',
      }
    case 'radar':
      return {
        fill: 'rgba(168, 85, 247, 0.15)',
        stroke: 'rgb(168, 85, 247)',
      }
  }
}

export const SensorVisualization = forwardRef<SensorVisualizationHandle, SensorVisualizationProps>(function SensorVisualization({
  sensors,
  sensorStatus,
  carDimensions = defaultCarDimensions,
  carOffset = defaultCarOffset,
  globalDisplay = { enabled: true, showPoints: true, showLabels: true, showFovs: true },
  initialViewState,
  onSensorDrag,
  onSelectionChange,
  selection,
  pixelsPerMeter: initialPPM = 4,
  onViewStateChange,
}, ref) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [draggingSensor, setDraggingSensor] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  
  // Zoom and pan state
  const [zoom, setZoom] = useState(initialViewState?.zoom ?? 1)
  const [pan, setPan] = useState({ x: initialViewState?.panX ?? 0, y: initialViewState?.panY ?? 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })

  // SVG dimensions
  const width = 1200
  const height = 600
  const centerX = width / 2
  const centerY = height / 2

  // Scale: pixels per meter
  const ppm = initialPPM * zoom

  // Distance rings (in meters)
  const distanceRings = [25, 50, 75, 100, 125, 150]

  // Expose reset and view state methods
  useImperativeHandle(ref, () => ({
    resetView: () => {
      setZoom(1)
      setPan({ x: 0, y: 0 })
    },
    centerView: () => {
      setPan({ x: 0, y: 0 })
    },
    getViewState: () => ({
      zoom,
      panX: pan.x,
      panY: pan.y,
    }),
    setView: (state: ViewState) => {
      setZoom(state.zoom)
      setPan({ x: state.panX, y: state.panY })
    },
  }), [zoom, pan])

  // Notify parent of view state changes
  useEffect(() => {
    onViewStateChange?.({ zoom, panX: pan.x, panY: pan.y })
  }, [zoom, pan, onViewStateChange])

  // Convert meters to pixels
  const metersToPixels = useCallback((meters: number) => meters * ppm, [ppm])

  // Convert world coordinates to SVG coordinates
  // World: +X = front (car forward), +Y = left
  // SVG: +X = right, +Y = down
  // Mapping: world +X -> SVG -Y (up), world +Y -> SVG -X (left)
  // Baselink is always at origin (0,0)
  const worldToSvg = useCallback((worldX: number, worldY: number) => {
    const svgX = centerX - worldY * ppm + pan.x
    const svgY = centerY - worldX * ppm + pan.y
    return { x: svgX, y: svgY }
  }, [centerX, centerY, ppm, pan])

  // Convert SVG coordinates to world coordinates
  const svgToWorld = useCallback((svgX: number, svgY: number) => {
    const worldY = -(svgX - centerX - pan.x) / ppm
    const worldX = -(svgY - centerY - pan.y) / ppm
    return { x: worldX, y: worldY }
  }, [centerX, centerY, ppm, pan])

  // Handle wheel for zoom — must use native addEventListener with passive:false
  // because React's onWheel registers a passive listener and cannot call preventDefault()
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? 0.9 : 1.1
      setZoom(prev => Math.max(0.2, Math.min(5, prev * delta)))
    }
    container.addEventListener('wheel', onWheel, { passive: false })
    return () => container.removeEventListener('wheel', onWheel)
  }, [])

  // Handle pan
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      e.preventDefault()
      setIsPanning(true)
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
    }
  }, [pan])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      })
    }
  }, [isPanning, panStart])

  const handleMouseUp = useCallback(() => {
    setIsPanning(false)
  }, [])

  useEffect(() => {
    if (isPanning) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
      return () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isPanning, handleMouseMove, handleMouseUp])

  // Sensor drag handlers
  const handleSensorMouseDown = useCallback(
    (e: React.MouseEvent, sensor: Sensor) => {
      e.preventDefault()
      e.stopPropagation()
      
      // Select sensor on click
      onSelectionChange?.({ type: 'sensor', sensor })

      if (!onSensorDrag) return

      const svg = svgRef.current
      if (!svg) return

      const point = svg.createSVGPoint()
      point.x = e.clientX
      point.y = e.clientY
      const svgPoint = point.matrixTransform(svg.getScreenCTM()?.inverse())

      // Sensor world position = sensor offset (relative to baselink at origin)
      const sensorSvgPos = worldToSvg(sensor.x, sensor.y)
      setDragOffset({
        x: svgPoint.x - sensorSvgPos.x,
        y: svgPoint.y - sensorSvgPos.y,
      })
      setDraggingSensor(sensor.id)
    },
    [onSensorDrag, onSelectionChange, worldToSvg]
  )

  const handleSensorDrag = useCallback(
    (e: MouseEvent) => {
      if (!draggingSensor || !onSensorDrag || !svgRef.current) return

      const svg = svgRef.current
      const point = svg.createSVGPoint()
      point.x = e.clientX
      point.y = e.clientY
      const svgPoint = point.matrixTransform(svg.getScreenCTM()?.inverse())

      const worldPos = svgToWorld(svgPoint.x - dragOffset.x, svgPoint.y - dragOffset.y)
      // worldPos is already relative to baselink (origin)
      onSensorDrag(draggingSensor, worldPos.x, worldPos.y)
    },
    [draggingSensor, onSensorDrag, dragOffset, svgToWorld]
  )

  const handleSensorDragEnd = useCallback(() => {
    setDraggingSensor(null)
  }, [])

  useEffect(() => {
    if (draggingSensor) {
      window.addEventListener('mousemove', handleSensorDrag)
      window.addEventListener('mouseup', handleSensorDragEnd)
      return () => {
        window.removeEventListener('mousemove', handleSensorDrag)
        window.removeEventListener('mouseup', handleSensorDragEnd)
      }
    }
  }, [draggingSensor, handleSensorDrag, handleSensorDragEnd])

  // Click on background to deselect
  const handleBackgroundClick = useCallback((e: React.MouseEvent) => {
    // Only deselect if clicking directly on background (not bubbled from children)
    if (e.target === e.currentTarget || (e.target as SVGElement).tagName === 'rect') {
      onSelectionChange?.(null)
    }
  }, [onSelectionChange])

  // Handle car click
  const handleCarClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onSelectionChange?.({ type: 'car' })
  }, [onSelectionChange])

  const isCarSelected = selection?.type === 'car'
  const selectedSensorId = selection?.type === 'sensor' ? selection.sensor.id : null

  // Car rendering - car center is offset from baselink (origin)
  const carElement = useMemo(() => {
    // Baselink is always at origin (0,0), car center is offset from it
    const carCenterWorld = { x: carOffset.x, y: carOffset.y }
    const carPos = worldToSvg(carCenterWorld.x, carCenterWorld.y)
    const carWidthPx = metersToPixels(carDimensions.width)
    const carLengthPx = metersToPixels(carDimensions.length)
    // Car is drawn with front pointing up (-Y in SVG), which aligns with +X in world coords
    // No rotation needed since baselink is the global coordinate system
    const svgRotation = 0

    return (
      <g 
        transform={`translate(${carPos.x}, ${carPos.y}) rotate(${svgRotation})`}
        onClick={handleCarClick}
        style={{ cursor: 'pointer' }}
      >
        {/* Selection glow effect */}
        {isCarSelected && (
          <>
            <rect
              x={-carWidthPx / 2 - 6}
              y={-carLengthPx / 2 - 6}
              width={carWidthPx + 12}
              height={carLengthPx + 12}
              rx={metersToPixels(0.4)}
              fill="none"
              stroke="rgb(251, 191, 36)"
              strokeWidth={3}
              strokeDasharray="8 4"
              className="animate-pulse"
            />
            <rect
              x={-carWidthPx / 2 - 3}
              y={-carLengthPx / 2 - 3}
              width={carWidthPx + 6}
              height={carLengthPx + 6}
              rx={metersToPixels(0.35)}
              fill="rgba(251, 191, 36, 0.1)"
            />
          </>
        )}

        {/* Car shadow */}
        <rect
          x={-carWidthPx / 2 + 2}
          y={-carLengthPx / 2 + 2}
          width={carWidthPx}
          height={carLengthPx}
          rx={metersToPixels(0.3)}
          fill="rgba(0,0,0,0.3)"
        />

        {/* Main car body */}
        <rect
          x={-carWidthPx / 2}
          y={-carLengthPx / 2}
          width={carWidthPx}
          height={carLengthPx}
          rx={metersToPixels(0.3)}
          fill={isCarSelected ? 'rgb(45, 55, 72)' : 'rgb(31, 41, 55)'}
          stroke={isCarSelected ? 'rgb(251, 191, 36)' : 'rgb(75, 85, 99)'}
          strokeWidth={isCarSelected ? 3 : 2}
          className="transition-all duration-150"
        />

        {/* Front windshield */}
        <rect
          x={-carWidthPx / 2 + metersToPixels(0.2)}
          y={-carLengthPx / 2 + metersToPixels(0.3)}
          width={carWidthPx - metersToPixels(0.4)}
          height={metersToPixels(0.8)}
          rx={metersToPixels(0.1)}
          fill="rgb(55, 65, 81)"
        />

        {/* Rear window */}
        <rect
          x={-carWidthPx / 2 + metersToPixels(0.25)}
          y={carLengthPx / 2 - metersToPixels(1.0)}
          width={carWidthPx - metersToPixels(0.5)}
          height={metersToPixels(0.6)}
          rx={metersToPixels(0.08)}
          fill="rgb(55, 65, 81)"
        />

        {/* Front indicator (arrow) */}
        <polygon
          points={`0,${-carLengthPx / 2 - metersToPixels(0.3)} ${-metersToPixels(0.3)},${-carLengthPx / 2 + metersToPixels(0.1)} ${metersToPixels(0.3)},${-carLengthPx / 2 + metersToPixels(0.1)}`}
          fill="rgb(59, 130, 246)"
        />

        {/* Baselink marker */}
        <circle
          cx={0}
          cy={0}
          r={metersToPixels(0.15)}
          fill="rgb(251, 191, 36)"
          stroke="white"
          strokeWidth={2}
        />
        <text
          x={metersToPixels(0.3)}
          y={metersToPixels(0.05)}
          fill="rgb(251, 191, 36)"
          fontSize={10}
          fontWeight="bold"
          className="select-none pointer-events-none"
        >
          BL
        </text>

        {/* Wheels */}
        {[
          { x: -carWidthPx / 2 - metersToPixels(0.05), y: -carLengthPx / 2 + metersToPixels(carDimensions.frontOverhang + 0.3) },
          { x: carWidthPx / 2 - metersToPixels(0.15), y: -carLengthPx / 2 + metersToPixels(carDimensions.frontOverhang + 0.3) },
          { x: -carWidthPx / 2 - metersToPixels(0.05), y: carLengthPx / 2 - metersToPixels(carDimensions.rearOverhang + 0.3) },
          { x: carWidthPx / 2 - metersToPixels(0.15), y: carLengthPx / 2 - metersToPixels(carDimensions.rearOverhang + 0.3) },
        ].map((pos, i) => (
          <rect
            key={i}
            x={pos.x}
            y={pos.y}
            width={metersToPixels(0.2)}
            height={metersToPixels(0.5)}
            rx={metersToPixels(0.05)}
            fill="rgb(17, 24, 39)"
          />
        ))}
      </g>
    )
  }, [worldToSvg, metersToPixels, carDimensions, carOffset, handleCarClick, isCarSelected])

  // Sensor FOV elements (rendered below car) - order matters for layering
  const sensorFovElements = useMemo(() => {
    if (!globalDisplay.enabled) {
      return null
    }

    // Render in reverse order - first item in list renders last (on top/front)
    return [...sensors].reverse().map((sensor) => {
      const alive = sensorStatus[sensor.id] !== false
      const colors = getSensorColor(sensor.type, alive)
      const isSelected = selectedSensorId === sensor.id
      
      const showFov = sensor.display.showFov && globalDisplay.showFovs
      
      if (!showFov) return null

      // Sensor position = sensor offset (relative to baselink at origin)
      const sensorSvg = worldToSvg(sensor.x, sensor.y)

      const fovPath = createFovPath(
        sensorSvg.x,
        sensorSvg.y,
        sensor.yaw,  // No additional rotation since baselink is the global coordinate system
        sensor.fov,
        metersToPixels(sensor.range)
      )

      return (
        <path
          key={`fov-${sensor.id}`}
          d={fovPath}
          fill={colors.fill}
          stroke={colors.stroke}
          strokeWidth={isSelected ? 2 : 1}
          className="transition-all duration-150"
          style={{ opacity: alive ? 1 : 0.4 }}
        />
      )
    })
  }, [sensors, sensorStatus, selectedSensorId, worldToSvg, metersToPixels, globalDisplay])

  // Sensor point/label elements (rendered above car)
  const sensorPointElements = useMemo(() => {
    if (!globalDisplay.enabled) {
      return null
    }

    // Render in reverse order - first item in list renders last (on top/front)
    return [...sensors].reverse().map((sensor) => {
      const alive = sensorStatus[sensor.id] !== false
      const colors = getSensorColor(sensor.type, alive)
      const isSelected = selectedSensorId === sensor.id
      
      const showPoint = sensor.display.showPoint && globalDisplay.showPoints
      const showLabel = sensor.display.showLabel && globalDisplay.showLabels
      
      if (!showPoint && !showLabel) return null

      // Sensor position = sensor offset (relative to baselink at origin)
      const sensorSvg = worldToSvg(sensor.x, sensor.y)
      const pointRadius = Math.max(4, Math.min(10, 8 / zoom))

      return (
        <g key={`point-${sensor.id}`} className="sensor-point-group">
          {/* Sensor point (draggable) */}
          {showPoint && (
            <g
              onMouseDown={(e) => handleSensorMouseDown(e, sensor)}
              style={{ cursor: onSensorDrag ? 'grab' : 'pointer' }}
              className={draggingSensor === sensor.id ? 'cursor-grabbing' : ''}
            >
              {/* Selection ring with glow */}
              {isSelected && (
                <>
                  <circle
                    cx={sensorSvg.x}
                    cy={sensorSvg.y}
                    r={pointRadius + 8}
                    fill="rgba(251, 191, 36, 0.2)"
                  />
                  <circle
                    cx={sensorSvg.x}
                    cy={sensorSvg.y}
                    r={pointRadius + 6}
                    fill="none"
                    stroke="rgb(251, 191, 36)"
                    strokeWidth={2}
                    strokeDasharray="4 2"
                    className="animate-pulse"
                  />
                </>
              )}
              <circle
                cx={sensorSvg.x}
                cy={sensorSvg.y}
                r={pointRadius}
                fill={alive ? colors.stroke : 'rgb(239, 68, 68)'}
                stroke={isSelected ? 'rgb(251, 191, 36)' : 'white'}
                strokeWidth={isSelected ? 2 : 1.5}
                className="transition-all duration-150"
              />
              {/* Sensor type icon */}
              {pointRadius >= 6 && (
                <text
                  x={sensorSvg.x}
                  y={sensorSvg.y + 1}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="white"
                  fontSize={Math.max(6, pointRadius - 2)}
                  fontWeight="bold"
                  className="select-none pointer-events-none"
                >
                  {sensor.type[0].toUpperCase()}
                </text>
              )}
            </g>
          )}

          {/* Sensor label */}
          {showLabel && (
            <text
              x={sensorSvg.x}
              y={sensorSvg.y - pointRadius - 8}
              textAnchor="middle"
              fill={isSelected ? 'rgb(251, 191, 36)' : alive ? 'rgb(209, 213, 219)' : 'rgb(239, 68, 68)'}
              fontSize={Math.max(8, 11 / Math.sqrt(zoom))}
              fontWeight={isSelected ? 700 : 500}
              className="transition-colors duration-150 select-none pointer-events-none"
            >
              {sensor.name}
            </text>
          )}
        </g>
      )
    })
  }, [sensors, sensorStatus, selectedSensorId, worldToSvg, handleSensorMouseDown, onSensorDrag, draggingSensor, zoom, globalDisplay])

  // Distance rings - centered at baselink (origin)
  const ringElements = useMemo(() => {
    const baselinkSvg = worldToSvg(0, 0)  // Baselink is always at origin
    
    return distanceRings.map((distance) => {
      const radiusPx = metersToPixels(distance)
      return (
        <g key={distance}>
          <circle
            cx={baselinkSvg.x}
            cy={baselinkSvg.y}
            r={radiusPx}
            fill="none"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth={1}
          />
          {/* Distance label - 4 positions */}
          {[0, 90, 180, 270].map((angle) => {
            const rad = (angle * Math.PI) / 180
            const labelX = baselinkSvg.x + radiusPx * Math.cos(rad)
            const labelY = baselinkSvg.y + radiusPx * Math.sin(rad)
            return (
              <text
                key={angle}
                x={labelX}
                y={labelY - 4}
                textAnchor="middle"
                fill="rgba(255,255,255,0.4)"
                fontSize={10}
                className="select-none pointer-events-none"
              >
                {distance}m
              </text>
            )
          })}
        </g>
      )
    })
  }, [worldToSvg, metersToPixels, distanceRings])

  // Coordinate axes - centered at baselink (origin)
  const axesElements = useMemo(() => {
    const baselinkSvg = worldToSvg(0, 0)  // Baselink is always at origin
    const axisLength = metersToPixels(180)
    
    return (
      <g>
        {/* X axis (front/forward) - points up in SVG */}
        <line
          x1={baselinkSvg.x}
          y1={baselinkSvg.y}
          x2={baselinkSvg.x}
          y2={baselinkSvg.y - axisLength}
          stroke="rgba(239, 68, 68, 0.4)"
          strokeWidth={1}
          strokeDasharray="8 4"
        />
        <text
          x={baselinkSvg.x + 8}
          y={baselinkSvg.y - axisLength + 20}
          fill="rgba(239, 68, 68, 0.6)"
          fontSize={12}
          fontWeight="bold"
          className="select-none pointer-events-none"
        >
          +X (Front)
        </text>
        
        {/* Y axis (left) - points left in SVG */}
        <line
          x1={baselinkSvg.x}
          y1={baselinkSvg.y}
          x2={baselinkSvg.x - axisLength}
          y2={baselinkSvg.y}
          stroke="rgba(34, 197, 94, 0.4)"
          strokeWidth={1}
          strokeDasharray="8 4"
        />
        <text
          x={baselinkSvg.x - axisLength + 10}
          y={baselinkSvg.y - 8}
          fill="rgba(34, 197, 94, 0.6)"
          fontSize={12}
          fontWeight="bold"
          className="select-none pointer-events-none"
        >
          +Y (Left)
        </text>
      </g>
    )
  }, [worldToSvg, metersToPixels])

  return (
    <div 
      ref={containerRef}
      className="w-full h-full overflow-hidden rounded-lg bg-background"
      style={{ cursor: isPanning ? 'grabbing' : 'default' }}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-full"
        style={{ touchAction: 'none' }}
        onMouseDown={handleMouseDown}
        onClick={handleBackgroundClick}
      >
        {/* Background grid */}
        <defs>
          <pattern
            id="grid-small"
            width={metersToPixels(10)}
            height={metersToPixels(10)}
            patternUnits="userSpaceOnUse"
            patternTransform={`translate(${centerX + pan.x}, ${centerY + pan.y})`}
          >
            <path
              d={`M ${metersToPixels(10)} 0 L 0 0 0 ${metersToPixels(10)}`}
              fill="none"
              stroke="rgba(255,255,255,0.03)"
              strokeWidth="1"
            />
          </pattern>
          <pattern
            id="grid-large"
            width={metersToPixels(50)}
            height={metersToPixels(50)}
            patternUnits="userSpaceOnUse"
            patternTransform={`translate(${centerX + pan.x}, ${centerY + pan.y})`}
          >
            <path
              d={`M ${metersToPixels(50)} 0 L 0 0 0 ${metersToPixels(50)}`}
              fill="none"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="1"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid-small)" />
        <rect width="100%" height="100%" fill="url(#grid-large)" />

        {/* Distance rings with labels */}
        {ringElements}

        {/* Coordinate axes */}
        {axesElements}

        {/* FOV coverage areas (render first, behind car) - order from sensors array */}
        {sensorFovElements}

        {/* Car body */}
        {carElement}

        {/* Sensor points and labels (render above car) */}
        {sensorPointElements}

        {/* Zoom info */}
        <g transform={`translate(${width - 120}, ${height - 40})`}>
          <rect
            x={0}
            y={0}
            width={110}
            height={30}
            rx={4}
            fill="rgba(0,0,0,0.6)"
          />
          <text
            x={55}
            y={20}
            textAnchor="middle"
            fill="rgb(156, 163, 175)"
            fontSize={11}
            className="select-none pointer-events-none"
          >
            Zoom: {(zoom * 100).toFixed(0)}%
          </text>
        </g>

        {/* Scale bar */}
        <g transform={`translate(20, ${height - 40})`}>
          <rect
            x={0}
            y={0}
            width={metersToPixels(50) + 20}
            height={30}
            rx={4}
            fill="rgba(0,0,0,0.6)"
          />
          <line
            x1={10}
            y1={15}
            x2={10 + metersToPixels(50)}
            y2={15}
            stroke="white"
            strokeWidth={2}
          />
          <line x1={10} y1={10} x2={10} y2={20} stroke="white" strokeWidth={2} />
          <line x1={10 + metersToPixels(50)} y1={10} x2={10 + metersToPixels(50)} y2={20} stroke="white" strokeWidth={2} />
          <text
            x={10 + metersToPixels(25)}
            y={26}
            textAnchor="middle"
            fill="white"
            fontSize={10}
            className="select-none pointer-events-none"
          >
            50m
          </text>
        </g>

        {/* Instructions */}
        <g transform="translate(20, 20)">
          <rect
            x={0}
            y={0}
            width={200}
            height={48}
            rx={4}
            fill="rgba(0,0,0,0.6)"
          />
          <text x={10} y={18} fill="rgb(156, 163, 175)" fontSize={10} className="select-none pointer-events-none">
            Scroll: Zoom | Shift+Drag: Pan
          </text>
          <text x={10} y={36} fill="rgb(156, 163, 175)" fontSize={10} className="select-none pointer-events-none">
            Click sensor/car: Edit | Drag: Move
          </text>
        </g>
      </svg>
    </div>
  )
})
