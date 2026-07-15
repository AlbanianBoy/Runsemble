'use client'

/**
 * TrackingSetupSheet — Phase 3
 *
 * One-time bottom sheet that walks Samsung / Xiaomi / Huawei / Oppo users
 * through the OEM battery settings needed for background GPS to survive
 * screen-off. Shown before the very first run start on native.
 *
 * Tone: honest, ~20 seconds, no blame. "Android doesn't know Runsemble is a
 * tracker yet — let's tell it."
 */

import { motion, AnimatePresence } from 'framer-motion'
import { Check, ChevronRight, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { type SetupStep } from '@/lib/use-tracking-setup'
import { Capacitor } from '@capacitor/core'

interface Props {
  open: boolean
  steps: SetupStep[]
  checkedSteps: Set<string>
  allChecked: boolean
  onToggleStep: (id: string) => void
  onDone: () => void
  onSkip: () => void
  manufacturer: string
}

const MFR_LABEL: Record<string, string> = {
  samsung: 'Samsung',
  xiaomi: 'Xiaomi / MIUI',
  huawei: 'Huawei / EMUI',
  oppo: 'OPPO / ColorOS',
  vivo: 'Vivo',
  oneplus: 'OnePlus',
}

async function openIntent(intent: string | null) {
  if (!intent) return
  try {
    // On Capacitor we can't launch arbitrary intents directly from JS without
    // a plugin — use App.openUrl with a custom scheme for well-known intents,
    // or fall back to the OS app-info screen which every Android supports.
    const { App } = await import('@capacitor/app')
    if (intent === 'app-info' || intent === 'app-battery-settings' || intent === 'battery-settings') {
      // android.settings.APPLICATION_DETAILS_SETTINGS is universally supported.
      await App.openUrl({ url: 'package:net.runsemble.app' })
    } else {
      // Try the package-based launcher URL; OS will open the app if installed.
      await App.openUrl({ url: `intent://#Intent;package=${intent};scheme=package;end` })
    }
  } catch {
    // Silently fail — the description text is enough to guide the user manually.
  }
}

export function TrackingSetupSheet({
  open,
  steps,
  checkedSteps,
  allChecked,
  onToggleStep,
  onDone,
  onSkip,
  manufacturer,
}: Props) {
  const mfrLabel = MFR_LABEL[manufacturer] ?? 'your phone'

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-[1600] bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Sheet */}
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-[1601] bg-background rounded-t-3xl px-5 pt-5 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] shadow-2xl max-h-[85vh] overflow-y-auto"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          >
            {/* Handle */}
            <div className="mx-auto w-10 h-1 rounded-full bg-muted-foreground/30 mb-5" />

            {/* Header */}
            <div className="flex items-start gap-3 mb-4">
              <div className="h-10 w-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold leading-tight">Tell {mfrLabel} you\u2019re a tracker</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Android doesn\u2019t know Runsemble records runs yet \u2014 it\u2019ll freeze the app when your screen turns off.
                  These 3 quick steps fix that. Takes 20 seconds.
                </p>
              </div>
            </div>

            {/* Steps */}
            <div className="space-y-3 mb-5">
              {steps.map((step, i) => {
                const done = checkedSteps.has(step.id)
                return (
                  <div
                    key={step.id}
                    className={`rounded-2xl border p-4 transition-colors ${
                      done ? 'border-primary/40 bg-primary/5' : 'border-border bg-card'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Step number / check */}
                      <button
                        onClick={() => onToggleStep(step.id)}
                        className={`h-7 w-7 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center transition-colors ${
                          done
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-muted-foreground/40 text-muted-foreground'
                        }`}
                        aria-label={done ? 'Mark undone' : 'Mark done'}
                      >
                        {done ? <Check className="h-3.5 w-3.5" /> : <span className="text-xs font-bold">{i + 1}</span>}
                      </button>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold leading-snug">{step.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{step.description}</p>

                        {step.actionIntent && (
                          <button
                            onClick={() => void openIntent(step.actionIntent)}
                            className="mt-2 flex items-center gap-1 text-xs font-semibold text-primary"
                          >
                            {step.actionLabel}
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* CTA */}
            <Button
              onClick={onDone}
              disabled={!allChecked}
              className="w-full h-12 rounded-full font-semibold text-base"
            >
              {allChecked ? "I\u2019m all set \u2014 let\u2019s run \uD83C\uDFC3" : `Complete all ${steps.length} steps above`}
            </Button>

            <button
              onClick={onSkip}
              className="w-full mt-2 py-2 text-xs text-muted-foreground underline underline-offset-4"
            >
              Skip for now (GPS may cut out with screen off)
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
