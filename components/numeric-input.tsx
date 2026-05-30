'use client'

import { useState, useEffect, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface NumericInputProps {
  value: number
  onChange: (value: number) => void
  allowNegative?: boolean
  decimals?: number
  className?: string
  onClick?: (e: React.MouseEvent) => void
}

export function NumericInput({
  value,
  onChange,
  allowNegative = true,
  decimals = 2,
  className,
  onClick,
}: NumericInputProps) {
  // Local state to handle intermediate input (like "1." or "-")
  const [localValue, setLocalValue] = useState<string>(value.toFixed(decimals))
  const [isFocused, setIsFocused] = useState(false)

  // Update local value when external value changes (and not focused)
  useEffect(() => {
    if (!isFocused) {
      setLocalValue(value.toFixed(decimals))
    }
  }, [value, isFocused, decimals])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value

    // Allow empty, negative sign, or valid number patterns
    const pattern = allowNegative 
      ? /^-?\d*\.?\d*$/ 
      : /^\d*\.?\d*$/

    // Special cases: empty, just minus sign, or ends with decimal point
    if (val === '' || val === '-' || val === '.' || val === '-.') {
      setLocalValue(val)
      return
    }

    if (pattern.test(val)) {
      setLocalValue(val)
      // Only update parent if it's a valid complete number
      const numVal = parseFloat(val)
      if (!isNaN(numVal)) {
        onChange(numVal)
      }
    }
  }, [allowNegative, onChange])

  const handleBlur = useCallback(() => {
    setIsFocused(false)
    // On blur, normalize the value
    const numVal = parseFloat(localValue)
    if (isNaN(numVal)) {
      setLocalValue(value.toFixed(decimals))
    } else {
      onChange(numVal)
      setLocalValue(numVal.toFixed(decimals))
    }
  }, [localValue, value, decimals, onChange])

  const handleFocus = useCallback(() => {
    setIsFocused(true)
  }, [])

  return (
    <Input
      type="text"
      inputMode="decimal"
      value={localValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onClick={onClick}
      className={cn('h-7 text-sm bg-transparent border-muted', className)}
    />
  )
}
