'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Camera, X, RotateCcw, Check, Loader2, SunMedium, Move, Focus } from 'lucide-react'
import type { CameraQualityFeedback } from '@/types'

interface ReceiptCameraProps {
  onCapture: (imageData: string, mimeType: string) => Promise<void>
  onClose: () => void
}

export default function ReceiptCamera({ onCapture, onClose }: ReceiptCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [isStreaming, setIsStreaming] = useState(false)
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [quality, setQuality] = useState<CameraQualityFeedback>({
    lightingOk: false,
    distanceOk: false,
    focusOk: false,
    readyToCapture: false,
  })

  // Start camera stream
  const startCamera = useCallback(async () => {
    try {
      setError(null)
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: 'environment', // Use back camera on mobile
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        try {
          await videoRef.current.play()
          setIsStreaming(true)
        } catch (playErr) {
          // Ignore AbortError - this happens when stream is interrupted (e.g., component unmount)
          if (playErr instanceof Error && playErr.name === 'AbortError') {
            console.log('Video play interrupted - this is normal during navigation')
            return
          }
          throw playErr
        }
      }
    } catch (err) {
      console.error('Camera access error:', err)
      // Don't show error for AbortError
      if (err instanceof Error && err.name === 'AbortError') return
      setError('Kunde inte komma åt kameran. Kontrollera att du har gett tillåtelse.')
    }
  }, [])

  // Stop camera stream
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    setIsStreaming(false)
  }, [])

  // Analyze video frame for quality feedback
  const analyzeQuality = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !isStreaming) return

    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas size to match video
    canvas.width = video.videoWidth / 4 // Downsample for analysis
    canvas.height = video.videoHeight / 4

    // Draw current frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    // Get image data for analysis
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const data = imageData.data

    // Calculate average brightness
    let totalBrightness = 0
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      totalBrightness += (r + g + b) / 3
    }
    const avgBrightness = totalBrightness / (data.length / 4)

    // Calculate contrast (standard deviation of brightness)
    let sumSquares = 0
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const brightness = (r + g + b) / 3
      sumSquares += Math.pow(brightness - avgBrightness, 2)
    }
    const contrast = Math.sqrt(sumSquares / (data.length / 4))

    // Quality assessment
    const lightingOk = avgBrightness > 80 && avgBrightness < 200
    const focusOk = contrast > 30 // Higher contrast suggests better focus
    const distanceOk = true // Would need edge detection for proper distance check

    const newQuality: CameraQualityFeedback = {
      lightingOk,
      distanceOk,
      focusOk,
      readyToCapture: lightingOk && focusOk && distanceOk,
    }

    if (!lightingOk) {
      newQuality.message = avgBrightness < 80 ? 'För mörkt - öka ljuset' : 'För ljust - minska ljuset'
    } else if (!focusOk) {
      newQuality.message = 'Försök hålla kameran stilla'
    }

    setQuality(newQuality)
  }, [isStreaming])

  // Quality analysis loop
  useEffect(() => {
    if (!isStreaming) return

    const interval = setInterval(analyzeQuality, 500)
    return () => clearInterval(interval)
  }, [isStreaming, analyzeQuality])

  // Start camera on mount
  useEffect(() => {
    startCamera()
    return () => stopCamera()
  }, [startCamera, stopCamera])

  // Capture image
  const captureImage = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return

    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas to full resolution
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    // Draw the current video frame
    ctx.drawImage(video, 0, 0)

    // Convert to base64
    const imageData = canvas.toDataURL('image/jpeg', 0.9)
    setCapturedImage(imageData)
    stopCamera()
  }, [stopCamera])

  // Retake photo
  const retake = useCallback(() => {
    setCapturedImage(null)
    startCamera()
  }, [startCamera])

  // Confirm and upload
  const confirmCapture = async () => {
    if (!capturedImage) return

    setIsProcessing(true)
    try {
      // Extract base64 data (remove data:image/jpeg;base64, prefix)
      const base64Data = capturedImage.split(',')[1]
      await onCapture(base64Data, 'image/jpeg')
    } catch (err) {
      console.error('Upload error:', err)
      setError('Kunde inte ladda upp bilden. Försök igen.')
      setIsProcessing(false)
    }
  }

  // Render captured image review
  if (capturedImage) {
    return (
      <div className="fixed inset-0 bg-black z-[100] overflow-hidden">
        {/* Header - fixed at top */}
        <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-4 bg-gradient-to-b from-black/70 to-transparent">
          <Button variant="ghost" size="icon" onClick={retake} disabled={isProcessing}>
            <RotateCcw className="h-5 w-5 text-white" />
          </Button>
          <h2 className="text-white font-medium">Granska bild</h2>
          <Button variant="ghost" size="icon" onClick={onClose} disabled={isProcessing}>
            <X className="h-5 w-5 text-white" />
          </Button>
        </div>

        {/* Image preview - centered */}
        <div className="absolute inset-0 flex items-center justify-center p-4 pt-20 pb-32">
          <img
            src={capturedImage}
            alt="Captured receipt"
            className="max-h-full max-w-full object-contain rounded-lg"
          />
        </div>

        {/* Action buttons - fixed at bottom */}
        <div
          className="absolute bottom-0 left-0 right-0 z-20 flex gap-4 justify-center bg-gradient-to-t from-black/70 to-transparent pt-8 pb-8 px-4"
          style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom, 2rem))' }}
        >
          <Button variant="outline" onClick={retake} disabled={isProcessing} className="bg-white/10 border-white text-white hover:bg-white/20">
            <RotateCcw className="mr-2 h-4 w-4" />
            Ta om
          </Button>
          <Button onClick={confirmCapture} disabled={isProcessing} className="bg-white text-black hover:bg-white/90">
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Analyserar...
              </>
            ) : (
              <>
                <Check className="mr-2 h-4 w-4" />
                Använd bild
              </>
            )}
          </Button>
        </div>
      </div>
    )
  }

  // Render camera view
  return (
    <div className="fixed inset-0 bg-black z-[100] overflow-hidden">
      {/* Header - fixed at top */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-4 bg-gradient-to-b from-black/70 to-transparent">
        <div className="w-10" />
        <h2 className="text-white font-medium">Skanna kvitto</h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-5 w-5 text-white" />
        </Button>
      </div>

      {/* Video preview - fills the screen */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 h-full w-full object-cover"
      />

      {/* Quality feedback overlay */}
      {isStreaming && (
        <div className="absolute bottom-36 left-0 right-0 flex justify-center z-10">
          <div className="bg-black/70 rounded-full px-4 py-2 flex items-center gap-4">
            <div className={`flex items-center gap-1 ${quality.lightingOk ? 'text-green-400' : 'text-yellow-400'}`}>
              <SunMedium className="h-4 w-4" />
              <span className="text-xs">Ljus</span>
            </div>
            <div className={`flex items-center gap-1 ${quality.distanceOk ? 'text-green-400' : 'text-yellow-400'}`}>
              <Move className="h-4 w-4" />
              <span className="text-xs">Avstånd</span>
            </div>
            <div className={`flex items-center gap-1 ${quality.focusOk ? 'text-green-400' : 'text-yellow-400'}`}>
              <Focus className="h-4 w-4" />
              <span className="text-xs">Fokus</span>
            </div>
          </div>
        </div>
      )}

      {/* Quality message */}
      {quality.message && (
        <div className="absolute top-20 left-0 right-0 flex justify-center z-10">
          <div className="bg-yellow-500/90 text-black px-4 py-2 rounded-full text-sm font-medium">
            {quality.message}
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-30">
          <div className="text-center p-4">
            <p className="text-white mb-4">{error}</p>
            <Button onClick={startCamera}>Försök igen</Button>
          </div>
        </div>
      )}

      {/* Guide overlay */}
      {isStreaming && (
        <div className="absolute inset-0 pointer-events-none z-10">
          <div className="absolute top-20 left-8 right-8 bottom-36 border-2 border-white/30 rounded-lg">
            <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-white rounded-tl-lg" />
            <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-white rounded-tr-lg" />
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-white rounded-bl-lg" />
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-white rounded-br-lg" />
          </div>
        </div>
      )}

      {/* Capture button - fixed at bottom */}
      <div
        className="absolute bottom-0 left-0 right-0 z-20 flex justify-center bg-gradient-to-t from-black/70 to-transparent pt-8 pb-8"
        style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom, 2rem))' }}
      >
        <button
          onClick={captureImage}
          disabled={!isStreaming}
          className="h-20 w-20 rounded-full border-4 border-white flex items-center justify-center bg-white/20 active:bg-white/40 disabled:opacity-50 transition-colors shadow-2xl backdrop-blur-sm"
        >
          <Camera className="h-8 w-8 text-white" />
        </button>
      </div>

      {/* Hidden canvas for image processing */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  )
}
