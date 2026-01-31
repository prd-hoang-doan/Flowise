/**
 * Creates a throttled function that only invokes the provided function at most once per every wait milliseconds
 * @param {Function} func - The function to throttle
 * @param {number} wait - The number of milliseconds to throttle invocations to
 * @returns {Function} The throttled function with a cancel method
 */
export const throttle = (func, wait) => {
    let timeout = null
    let previous = 0

    const throttled = function (...args) {
        const now = Date.now()
        const remaining = wait - (now - previous)

        if (remaining <= 0 || remaining > wait) {
            if (timeout) {
                clearTimeout(timeout)
                timeout = null
            }
            previous = now
            func.apply(this, args)
        } else if (!timeout) {
            timeout = setTimeout(() => {
                previous = Date.now()
                timeout = null
                func.apply(this, args)
            }, remaining)
        }
    }

    throttled.cancel = function () {
        if (timeout) {
            clearTimeout(timeout)
            timeout = null
        }
        previous = 0
    }

    return throttled
}
