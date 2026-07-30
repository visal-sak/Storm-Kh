"use client"

import { useEffect, useRef } from "react"
import type * as mapboxgl from "maplibre-gl"
import { useMap } from "./hooks"
import type { MapCoordinates } from "./types"

/**
 * terrae's registry rain component drives `map.setRain()`, a Mapbox GL v3.9+
 * API that MapLibre does not implement — on this stack it only logs a warning
 * and returns. It is also a full-screen post-process, which is wrong for a
 * dashboard that has to show rain over one city and not another.
 *
 * This is the MapLibre equivalent: an animated canvas sprite anchored to a
 * coordinate, using the same StyleImageInterface pattern as the vendored
 * cyclone component. It renders per location and it geolocates.
 */

type Droplet = {
  x: number
  y: number
  length: number
  speed: number
  opacity: number
  width: number
}

type RainRenderer = {
  width: number
  height: number
  data: Uint8ClampedArray
  context?: CanvasRenderingContext2D
  droplets: Droplet[]
  isActive: boolean
  onAdd: () => void
  render: () => boolean
}

type MapRainProps = {
  id: string
  coordinates: MapCoordinates
  /** Sprite size in px; larger reads as a wider shower. */
  size?: number
  /** 0–1. Scales droplet count, opacity and fall speed. */
  intensity?: number
  color?: string
  /** Horizontal drift per frame, in px — wind shear. */
  slant?: number
  /** False renders a single static frame instead of looping. */
  animated?: boolean
}

const DEFAULT_SIZE = 170
const DEFAULT_INTENSITY = 0.6
const DEFAULT_COLOR = "#7fb4d8"
const DEFAULT_SLANT = 0.35

const MIN_DROPLETS = 18
const MAX_DROPLETS = 130
const BASE_SPEED = 2.4
const SPEED_RANGE = 3.2
const LENGTH_MIN = 8
const LENGTH_RANGE = 12
const PIXEL_RATIO = 2

const hexToRgb = (hex: string) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return { r: 127, g: 180, b: 216 }
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  }
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const createDroplet = (size: number, intensity: number): Droplet => ({
  x: Math.random() * size,
  y: Math.random() * size,
  length: LENGTH_MIN + Math.random() * LENGTH_RANGE * intensity,
  speed: (BASE_SPEED + Math.random() * SPEED_RANGE) * (0.6 + intensity),
  opacity: 0.45 + Math.random() * 0.45 * intensity,
  width: Math.random() < 0.3 ? 2.2 : 1.5,
})

/**
 * Fades the sprite towards its edges so the shower blends into the basemap
 * instead of ending on a hard square boundary.
 */
const fadeEdges = (context: CanvasRenderingContext2D, size: number) => {
  const gradient = context.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.18,
    size / 2,
    size / 2,
    size / 2
  )
  gradient.addColorStop(0, "rgba(0,0,0,0)")
  gradient.addColorStop(1, "rgba(0,0,0,1)")
  context.globalCompositeOperation = "destination-out"
  context.fillStyle = gradient
  context.fillRect(0, 0, size, size)
  context.globalCompositeOperation = "source-over"
}

const createRainRenderer = (
  size: number,
  intensity: number,
  color: string,
  slant: number
): RainRenderer => {
  const rgb = hexToRgb(color)
  const count = Math.round(MIN_DROPLETS + (MAX_DROPLETS - MIN_DROPLETS) * intensity)

  return {
    width: size,
    height: size,
    data: new Uint8ClampedArray(size * size * 4),
    droplets: Array.from({ length: count }, () => createDroplet(size, intensity)),
    isActive: true,

    onAdd() {
      const canvas = document.createElement("canvas")
      canvas.width = this.width
      canvas.height = this.height
      this.context = canvas.getContext("2d", { willReadFrequently: true }) || undefined
    },

    render() {
      const context = this.context
      if (!context) return false

      context.clearRect(0, 0, size, size)
      context.lineCap = "round"

      for (const droplet of this.droplets) {
        droplet.y += droplet.speed
        droplet.x += slant * droplet.speed

        // Recycle above the top edge so the shower never thins out.
        if (droplet.y > size) {
          droplet.y = -droplet.length
          droplet.x = Math.random() * size
        }
        if (droplet.x > size) droplet.x = 0

        context.beginPath()
        context.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${droplet.opacity})`
        context.lineWidth = droplet.width
        context.moveTo(droplet.x, droplet.y)
        context.lineTo(droplet.x - slant * droplet.length, droplet.y - droplet.length)
        context.stroke()
      }

      fadeEdges(context, size)
      this.data = context.getImageData(0, 0, size, size).data
      return true
    },
  }
}

export const MapRain = ({
  id,
  coordinates,
  size = DEFAULT_SIZE,
  intensity = DEFAULT_INTENSITY,
  color = DEFAULT_COLOR,
  slant = DEFAULT_SLANT,
  animated = true,
}: MapRainProps) => {
  const { map, isLoaded } = useMap()
  const frameRef = useRef<number | null>(null)
  const sourceId = `${id}-source`
  const layerId = `${id}-layer`

  useEffect(() => {
    if (!isLoaded || !map) return

    const renderer = createRainRenderer(size, clamp(intensity, 0, 1), color, slant)

    const addSourceAndLayer = () => {
      if (!map.hasImage(id)) {
        map.addImage(id, renderer as unknown as mapboxgl.StyleImageInterface, {
          pixelRatio: PIXEL_RATIO,
        })
      }
      if (!map.getSource(sourceId)) {
        map.addSource(sourceId, {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: [
              { type: "Feature", geometry: { type: "Point", coordinates }, properties: {} },
            ],
          },
        })
      }
      if (!map.getLayer(layerId)) {
        map.addLayer({
          id: layerId,
          type: "symbol",
          source: sourceId,
          layout: { "icon-image": id, "icon-allow-overlap": true },
        })
      }
    }

    addSourceAndLayer()

    // A style swap (light ↔ dark) drops every custom layer, so they are rebuilt.
    const handleStyleLoad = () => addSourceAndLayer()
    map.on("style.load", handleStyleLoad)

    // One frame is enough to show where it is raining; the endless repaint is
    // the part reduced-motion users are asking not to have.
    if (animated) {
      const animate = () => {
        map.triggerRepaint()
        frameRef.current = requestAnimationFrame(animate)
      }
      frameRef.current = requestAnimationFrame(animate)
    } else {
      frameRef.current = requestAnimationFrame(() => map.triggerRepaint())
    }

    return () => {
      map.off("style.load", handleStyleLoad)
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
      if (!map.getStyle()) return
      if (map.getLayer(layerId)) map.removeLayer(layerId)
      if (map.getSource(sourceId)) map.removeSource(sourceId)
      if (map.hasImage(id)) map.removeImage(id)
    }
  }, [map, isLoaded, id, sourceId, layerId, coordinates, size, intensity, color, slant, animated])

  return null
}
