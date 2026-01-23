import { useEffect, useState } from 'react'

/**
 * Use debounce hook
 * @template T
 * @param {T} value The value to debounce
 * @param {number} delay The debounce delay in milliseconds
 * @returns T
 */
function useDebounce(value, delay) {
    const [debouncedValue, setDebouncedValue] = useState(value)

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedValue(value)
        }, delay)

        return () => {
            clearTimeout(timer)
        }
    }, [value, delay])

    return debouncedValue
}

export default useDebounce
