/**
 * Web Vitals Performance Monitoring
 *
 * Collects Core Web Vitals metrics (LCP, FID, CLS) and reports them
 * for performance analysis.
 *
 * Note: This module uses native Performance APIs and does not require
 * the web-vitals library. For full web-vitals support, install the package.
 */

// Performance metrics storage
interface PerformanceMetrics {
  lcp?: number;
  fid?: number;
  cls?: number;
  fcp?: number;
  ttfb?: number;
  inp?: number;
}

const metrics: PerformanceMetrics = {};

/**
 * Report metric to analytics endpoint or console
 */
function reportMetric(name: string, value: number, rating: string): void {
  // Store metric locally
  switch (name) {
    case 'LCP':
      metrics.lcp = value;
      break;
    case 'FID':
      metrics.fid = value;
      break;
    case 'CLS':
      metrics.cls = value;
      break;
    case 'FCP':
      metrics.fcp = value;
      break;
    case 'TTFB':
      metrics.ttfb = value;
      break;
    case 'INP':
      metrics.inp = value;
      break;
  }

  // Log to console in development
  if (import.meta.env.DEV) {
    console.log(`[Web Vitals] ${name}: ${value.toFixed(2)} (${rating})`);
  }

  // Send to analytics endpoint in production
  if (import.meta.env.PROD) {
    sendToAnalytics({
      name,
      value,
      rating,
      timestamp: Date.now(),
      url: window.location.href,
    });
  }
}

/**
 * Get rating based on thresholds
 */
function getRating(name: string, value: number): string {
  const thresholds: Record<string, [number, number]> = {
    LCP: [2500, 4000],
    FID: [100, 300],
    CLS: [0.1, 0.25],
    FCP: [1800, 3000],
    TTFB: [800, 1800],
    INP: [200, 500],
  };

  const [good, needsImprovement] = thresholds[name] || [0, 0];
  if (value <= good) return 'good';
  if (value <= needsImprovement) return 'needs-improvement';
  return 'poor';
}

/**
 * Send metrics to analytics endpoint
 */
async function sendToAnalytics(data: {
  name: string;
  value: number;
  rating: string;
  timestamp: number;
  url: string;
}): Promise<void> {
  try {
    // Use sendBeacon for reliable delivery
    if (navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      navigator.sendBeacon('/api/v1/analytics/vitals', blob);
    } else {
      // Fallback to fetch
      await fetch('/api/v1/analytics/vitals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        keepalive: true,
      });
    }
  } catch {
    // Silently fail - don't impact user experience
  }
}

/**
 * Initialize Web Vitals monitoring using native Performance APIs
 */
export function initWebVitals(): void {
  if (typeof window === 'undefined' || !('PerformanceObserver' in window)) {
    console.warn('[Web Vitals] Performance APIs not available');
    return;
  }

  // Observe Largest Contentful Paint (LCP)
  try {
    const lcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const lastEntry = entries[entries.length - 1];
      if (lastEntry) {
        const value = lastEntry.startTime;
        reportMetric('LCP', value, getRating('LCP', value));
      }
    });
    lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {
    // LCP observation not supported
  }

  // Observe First Input Delay (FID)
  try {
    const fidObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const firstEntry = entries[0] as PerformanceEventTiming;
      if (firstEntry) {
        const value = firstEntry.processingStart - firstEntry.startTime;
        reportMetric('FID', value, getRating('FID', value));
      }
    });
    fidObserver.observe({ type: 'first-input', buffered: true });
  } catch {
    // FID observation not supported
  }

  // Observe Cumulative Layout Shift (CLS)
  try {
    let clsValue = 0;
    const clsObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const layoutShift = entry as PerformanceEntry & { hadRecentInput: boolean; value: number };
        if (!layoutShift.hadRecentInput) {
          clsValue += layoutShift.value;
        }
      }
      reportMetric('CLS', clsValue, getRating('CLS', clsValue));
    });
    clsObserver.observe({ type: 'layout-shift', buffered: true });
  } catch {
    // CLS observation not supported
  }

  // Observe First Contentful Paint (FCP)
  try {
    const fcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const fcpEntry = entries.find((e) => e.name === 'first-contentful-paint');
      if (fcpEntry) {
        const value = fcpEntry.startTime;
        reportMetric('FCP', value, getRating('FCP', value));
      }
    });
    fcpObserver.observe({ type: 'paint', buffered: true });
  } catch {
    // FCP observation not supported
  }

  // Observe Time to First Byte (TTFB)
  try {
    const navEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    if (navEntry) {
      const value = navEntry.responseStart - navEntry.requestStart;
      reportMetric('TTFB', value, getRating('TTFB', value));
    }
  } catch {
    // TTFB observation not supported
  }

  console.log('[Web Vitals] Monitoring initialized');
}

/**
 * Get current metrics snapshot
 */
export function getMetrics(): PerformanceMetrics {
  return { ...metrics };
}

/**
 * Check if metrics meet performance targets
 */
export function checkPerformanceTargets(): {
  passed: boolean;
  details: Record<string, { value: number | undefined; target: number; passed: boolean }>;
} {
  const targets = {
    lcp: 2500, // 2.5s - Good LCP
    fid: 100, // 100ms - Good FID
    cls: 0.1, // 0.1 - Good CLS
    fcp: 1800, // 1.8s - Good FCP
    ttfb: 800, // 800ms - Good TTFB
  };

  const details: Record<string, { value: number | undefined; target: number; passed: boolean }> = {};
  let allPassed = true;

  for (const [key, target] of Object.entries(targets)) {
    const value = metrics[key as keyof PerformanceMetrics];
    const passed = value !== undefined && value <= target;
    details[key] = { value, target, passed };
    if (!passed && value !== undefined) {
      allPassed = false;
    }
  }

  return { passed: allPassed, details };
}

/**
 * Performance observer for custom metrics
 */
export function observeCustomMetrics(): void {
  if (typeof window === 'undefined' || !('PerformanceObserver' in window)) {
    return;
  }

  // Observe long tasks
  try {
    const longTaskObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration > 50) {
          console.warn(`[Performance] Long task detected: ${entry.duration.toFixed(2)}ms`);
        }
      }
    });
    longTaskObserver.observe({ entryTypes: ['longtask'] });
  } catch {
    // Long task observation not supported
  }

  // Observe resource loading
  try {
    const resourceObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const resourceEntry = entry as PerformanceResourceTiming;
        if (resourceEntry.duration > 1000) {
          console.warn(
            `[Performance] Slow resource: ${resourceEntry.name} (${resourceEntry.duration.toFixed(2)}ms)`
          );
        }
      }
    });
    resourceObserver.observe({ entryTypes: ['resource'] });
  } catch {
    // Resource observation not supported
  }
}
