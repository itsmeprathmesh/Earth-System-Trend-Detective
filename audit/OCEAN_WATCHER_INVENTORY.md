# Ocean Watcher Component Inventory

Reference inspected at `C:\Users\YASH BINEKAR\langflow\New folder (2)\ocean-watcher`. No source code, datasets, content, branding, or assets are copied. Reuse approval remains pending.

| Component | Source File | Behavior | Target Equivalent | Portability | Decision |
|---|---|---|---|---|---|
| Design tokens and base styling | `src/index.css`, `src/App.css` | Dark palette, base typography, responsive utility styling; CSS imports Tailwind. | Existing `styles.css` design system. | Medium | Independently extend target CSS variables; no Tailwind import. |
| Navigation and action cluster | `src/components/TopNavBar.tsx` | State/status badge, selectors, reset, data/method and assistant entry points, narration toggle. Uses React store, lucide-react, canvas-confetti. | Target top bar, reset, method link. | Medium | Add simple accessible HTML buttons to existing header; omit incident state, confetti, and reference branding. |
| Dashboard panels | `src/App.tsx`, `src/components/LeftLayerPanel.tsx`, `src/components/RightIncidentPanel.tsx` | Multi-panel ocean dashboard with layer controls, incident status and operational summaries. Uses React and synthetic incident presets. | Target map, annual chart, trend card, insight panel. | Low | Keep existing target layout and science. No ocean metrics or incident copy. |
| Time controls | `src/components/BottomTimeSlider.tsx` | Playback and keyframes over a simulated 0–24 hour forecast, with speed controls. React state and icons required. | Start/end year controls in target. | Medium | Retain target's actual dataset-bounded year sliders; add synchronized bounds and ARIA value text. Forecast playback is scientifically unsuitable for this historical dataset. |
| Trend report export | `src/utils/reportGenerator.ts` | Downloads Markdown and JSON reports from an ocean incident object. Includes prebuilt operational claims and metrics. | Existing target CSV export and computed trend statistics. | Low | Independently produce a Markdown report using only current target metadata/results; retain CSV. Skip all reference report contents and claims. |
| Guided narration | `src/utils/speechNarration.ts`, `src/components/RightIncidentPanel.tsx` | Web Speech API narration with voice selection and cancel. | Target text demo dialog. | High | Independently use native speech synthesis, pause/resume and exit; always keep the visible text alternative. |
| Assistant panel | `src/components/AIAssistantModal.tsx` | Chat-like prompt panel connected to Ocean Watcher state and preset response flows. React state and speech utility required. | None in target. | Medium | Rewrite as deterministic rules over current GISTEMP metadata and computed values; no external model or unsupported claims. |
| Data transparency modal | `src/components/DataAdapterModal.tsx` | Tabs describing real/synthetic adapters and proposed ocean data flows. Uses React and reference-specific content. | NASA source link and method paragraph. | Low | Rewrite a metadata-driven Data & Method dialog; omit synthetic adapter claims. |
| Architecture modal | `src/components/ArchitectureModal.tsx` | Describes the reference system pipeline and technologies. | No target equivalent. | Low | Skip; it describes another application rather than Earth science methods. |

## Portability and risk notes

The reference project is React 19 + TypeScript with Vite, Tailwind CSS, Three.js, lucide-react, and canvas-confetti. Direct component reuse would violate the target's vanilla architecture and could import irrelevant operational/scientific claims. Equivalent behaviors are implemented independently with classic JavaScript, native dialog/download APIs, and existing target metadata. The Ocean Watcher dataset and synthetic incident presets are excluded.

