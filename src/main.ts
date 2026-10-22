import './style.css';
import { DEFAULT_SETTINGS, normalizeSettings, type CameraView, type Mood, type WorldSettings } from './settings';
import { NocturneWorld } from './world';
import { NightAudio } from './audio';

const STORAGE_KEY = 'nocturne.scene.v1';

type StoredScene = Partial<WorldSettings>;

const appElement = document.querySelector<HTMLDivElement>('#app');
if (!appElement) throw new Error('NOCTURNE could not find its application root.');
const app: HTMLDivElement = appElement;

app.innerHTML = `
  <canvas id="scene" aria-label="상호작용 가능한 달빛 호수 장면" aria-description="수면을 누르거나 Enter 키를 눌러 밤을 깨울 수 있습니다." tabindex="0"></canvas>
  <div class="scene-vignette" aria-hidden="true"></div>
  <div class="interface" id="interface">
    <header class="topbar">
      <a class="wordmark" href="#scene" aria-label="NOCTURNE 처음 장면">NOCTURNE</a>
      <span class="pause-status" id="pause-status" aria-live="polite">장면 재생 중</span>
      <div class="header-actions" aria-label="장면 도구">
        <button class="chrome-button" id="sound-toggle" type="button" aria-pressed="false">소리 켜기</button>
        <button class="chrome-button icon-button" id="immersive-toggle" type="button" aria-pressed="false" aria-label="인터페이스 숨기기" title="인터페이스 숨기기 (H)"><span aria-hidden="true">⌜⌟</span></button>
        <button class="chrome-button icon-button" id="about-toggle" type="button" aria-haspopup="dialog" aria-controls="about-dialog" aria-label="도움말" title="도움말"><span aria-hidden="true">i</span></button>
      </div>
    </header>

    <main class="scene-copy" data-od-id="scene-introduction" aria-label="장면 안내">
      <p class="eyebrow">REALTIME NIGHT STUDY</p>
      <h1>밤을, 연출하다.</h1>
      <p class="description">달빛과 물결 사이, 잠시 머물 수 있는 작은 장면.</p>
      <p class="summon-hint" aria-live="polite">수면을 누르면, 밤이 깨어납니다.</p>
    </main>

    <section class="direction-panel" id="direction-panel" data-od-id="direction-controls" aria-label="연출 도구" aria-hidden="true">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">DIRECTION</p>
          <h2>연출</h2>
        </div>
        <button class="close-button" type="button" id="panel-close" aria-label="연출 도구 닫기">×</button>
      </div>
      <div class="control-list">
        <label class="range-field" for="fog"><span>안개</span><output id="fog-value" for="fog">42</output></label>
        <input id="fog" type="range" min="0" max="100" value="42" aria-label="안개" />
        <label class="range-field" for="wind"><span>바람</span><output id="wind-value" for="wind">30</output></label>
        <input id="wind" type="range" min="0" max="100" value="30" aria-label="바람" />
        <label class="range-field" for="fireflies"><span>반딧불이</span><output id="fireflies-value" for="fireflies">65</output></label>
        <input id="fireflies" type="range" min="0" max="100" value="65" aria-label="반딧불이" />
        <label class="range-field" for="moonlight"><span>달빛</span><output id="moonlight-value" for="moonlight">70</output></label>
        <input id="moonlight" type="range" min="0" max="100" value="70" aria-label="달빛" />
      </div>
      <fieldset class="view-selector">
        <legend>카메라</legend>
        <div class="segmented" role="group" aria-label="카메라 선택">
          <button type="button" data-camera="wide" aria-pressed="true">와이드</button>
          <button type="button" data-camera="water" aria-pressed="false">수면</button>
          <button type="button" data-camera="orbit" aria-pressed="false">궤도</button>
        </div>
      </fieldset>
      <div class="panel-actions">
        <button class="action-button" id="pause-toggle" type="button" aria-pressed="false">장면 멈춤</button>
        <button class="text-button" id="reset-scene" type="button">초기화</button>
      </div>
    </section>

    <footer class="bottom-bar" data-od-id="mood-and-export">
      <div class="mood-control" aria-label="장면의 색을 선택">
        <span class="meta-label">MOOD</span>
        <div class="mood-tabs" role="group">
          <button type="button" data-mood="moon" aria-pressed="true"><span class="mood-mark" aria-hidden="true">◐</span> 달빛의 숲</button>
          <button type="button" data-mood="dawn" aria-pressed="false"><span class="mood-mark" aria-hidden="true">◒</span> 푸른 새벽</button>
          <button type="button" data-mood="ember" aria-pressed="false"><span class="mood-mark" aria-hidden="true">◑</span> 붉은 달</button>
        </div>
      </div>
      <div class="bottom-actions">
        <button class="action-button" id="direction-toggle" type="button" aria-expanded="false" aria-controls="direction-panel">연출</button>
        <button class="action-button export-button" id="capture-scene" type="button">4K 장면 저장</button>
      </div>
    </footer>
  </div>
  <button class="hidden-restore" id="hidden-restore" type="button" aria-label="인터페이스 보이기" aria-hidden="true">
    <span>NOCTURNE</span><span class="restore-key">H</span>
  </button>
  <div class="status-message" id="status-message" role="status" aria-live="polite"></div>
  <div class="loading-layer" id="loading-layer" role="status" aria-live="polite"><span>장면을 불러오는 중</span></div>
  <dialog class="about-dialog" id="about-dialog" aria-labelledby="about-title">
    <div class="dialog-inner">
      <div class="panel-heading">
        <div><p class="eyebrow">NOCTURNE</p><h2 id="about-title">장면에 관하여</h2></div>
        <button class="close-button" type="button" id="about-close" aria-label="도움말 닫기">×</button>
      </div>
      <p><a href="https://x.com/chetanankola/status/2101595285675970853" target="_blank" rel="noreferrer">달빛 늪지</a>와 <a href="https://x.com/star_tronica/status/2094584296769986730" target="_blank" rel="noreferrer">touch:waves</a>의 공개된 인터랙션 사례에서 영감을 받아 새롭게 구성한 장면입니다.</p>
      <p class="dialog-note">수면을 눌러 물결을 만들고, Space로 멈춤/재생, H로 인터페이스 숨기기, Esc로 돌아오거나 창을 닫습니다.</p>
    </div>
  </dialog>
`;

const $ = <T extends HTMLElement>(selector: string) => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing required control: ${selector}`);
  return element;
};

const canvas = $<HTMLCanvasElement>('#scene');
const interfaceLayer = $<HTMLDivElement>('#interface');
const loading = $<HTMLDivElement>('#loading-layer');
const status = $<HTMLDivElement>('#status-message');
const panel = $<HTMLElement>('#direction-panel');
const about = $<HTMLDialogElement>('#about-dialog');
const soundButton = $<HTMLButtonElement>('#sound-toggle');
const immersiveButton = $<HTMLButtonElement>('#immersive-toggle');
const pauseButton = $<HTMLButtonElement>('#pause-toggle');
const directionButton = $<HTMLButtonElement>('#direction-toggle');
const captureButton = $<HTMLButtonElement>('#capture-scene');
const hiddenRestore = $<HTMLButtonElement>('#hidden-restore');
const pauseStatus = $<HTMLSpanElement>('#pause-status');
panel.inert = true;
hiddenRestore.tabIndex = -1;

function readStoredScene(): { settings: WorldSettings; hadStoredSettings: boolean } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { settings: { ...DEFAULT_SETTINGS }, hadStoredSettings: false };
    const stored: StoredScene = JSON.parse(raw);
    const settings = normalizeSettings(stored);
    // `normalizeSettings` owns value bounds; paused is intentionally restored separately.
    settings.paused = typeof stored.paused === 'boolean' ? stored.paused : DEFAULT_SETTINGS.paused;
    return { settings, hadStoredSettings: true };
  } catch {
    return { settings: { ...DEFAULT_SETTINGS }, hadStoredSettings: false };
  }
}

const restored = readStoredScene();
let settings = restored.settings;
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) settings = { ...settings, paused: true };
// Audio always begins silent; a page reload must not manufacture an audio gesture.
let soundEnabled = false;
let soundEnabledBeforeHidden = false;
let world: NocturneWorld | null = null;
let audio: NightAudio | null = null;
let statusTimer = 0;

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // A private browsing quota failure should never stop the instrument.
  }
}

function announce(message: string, duration = 2400) {
  window.clearTimeout(statusTimer);
  status.textContent = message;
  status.classList.add('is-visible');
  statusTimer = window.setTimeout(() => status.classList.remove('is-visible'), duration);
}

function setLoading(message?: string) {
  loading.textContent = message ?? '';
  loading.hidden = !message;
}

function showFailure(error: unknown) {
  const message = error instanceof Error ? error.message : '알 수 없는 오류';
  loading.hidden = false;
  loading.setAttribute('role', 'alert');
  const card = document.createElement('div');
  card.className = 'error-card';
  const title = document.createElement('p');
  title.textContent = '장면을 시작하지 못했습니다.';
  const detail = document.createElement('span');
  detail.textContent = message;
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = '다시 시도';
  retry.addEventListener('click', () => window.location.reload());
  card.append(title, detail, retry);
  loading.replaceChildren(card);
}

function reportTransientError(prefix: string, error: unknown) {
  const message = error instanceof Error ? error.message : '다시 시도해 주세요.';
  announce(`${prefix}: ${message}`, 4400);
}

function applySettings(partial: Partial<WorldSettings>) {
  settings = { ...settings, ...partial };
  world?.update(partial);
  if ('wind' in partial || 'mood' in partial) audio?.update(settings.wind, settings.mood);
  persist();
  renderControls();
}

function renderControls() {
  const ranges: Array<keyof Pick<WorldSettings, 'fog' | 'wind' | 'fireflies' | 'moonlight'>> = ['fog', 'wind', 'fireflies', 'moonlight'];
  ranges.forEach((key) => {
    const input = $<HTMLInputElement>(`#${key}`);
    const output = $<HTMLOutputElement>(`#${key}-value`);
    input.value = String(settings[key]);
    output.value = String(settings[key]);
  });
  document.querySelectorAll<HTMLButtonElement>('[data-mood]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.mood === settings.mood));
  });
  document.querySelectorAll<HTMLButtonElement>('[data-camera]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.camera === settings.camera));
  });
  pauseButton.setAttribute('aria-pressed', String(settings.paused));
  pauseButton.textContent = settings.paused ? '장면 재생' : '장면 멈춤';
  pauseStatus.textContent = settings.paused ? '장면 멈춤' : '장면 재생 중';
  soundButton.setAttribute('aria-pressed', String(soundEnabled));
  soundButton.textContent = soundEnabled ? '소리 끄기' : '소리 켜기';
}

function setPanel(open: boolean, returnFocus = true) {
  panel.classList.toggle('is-open', open);
  panel.setAttribute('aria-hidden', String(!open));
  panel.inert = !open;
  directionButton.setAttribute('aria-expanded', String(open));
  if (open) $<HTMLButtonElement>('#fog').focus({ preventScroll: true });
  else if (returnFocus) directionButton.focus({ preventScroll: true });
}

function setImmersive(hidden: boolean) {
  app.classList.toggle('is-immersive', hidden);
  interfaceLayer.inert = hidden;
  immersiveButton.setAttribute('aria-pressed', String(hidden));
  immersiveButton.setAttribute('aria-label', hidden ? '인터페이스 보이기' : '인터페이스 숨기기');
  hiddenRestore.setAttribute('aria-hidden', String(!hidden));
  hiddenRestore.tabIndex = hidden ? 0 : -1;
  if (hidden) {
    setPanel(false, false);
    canvas.focus({ preventScroll: true });
  }
}

async function toggleSound() {
  const next = !soundEnabled;
  soundButton.disabled = true;
  try {
    await audio?.setEnabled(next);
    soundEnabled = next;
    persist();
    renderControls();
    announce(next ? '밤의 소리를 켰습니다.' : '밤의 소리를 껐습니다.');
  } catch (error) {
    reportTransientError('소리를 바꾸지 못했습니다', error);
  } finally {
    soundButton.disabled = false;
  }
}

async function captureScene() {
  if (!world) return;
  captureButton.disabled = true;
  const label = captureButton.textContent;
  captureButton.textContent = '장면 저장 중…';
  try {
    const blob = await world.snapshot(3840, 2160);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `nocturne-${settings.mood}-${new Date().toISOString().slice(0, 10)}.png`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    announce('4K 장면을 저장했습니다.');
  } catch (error) {
    reportTransientError('장면을 저장하지 못했습니다', error);
  } finally {
    captureButton.disabled = false;
    captureButton.textContent = label;
  }
}

function isFormControl(target: EventTarget | null) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target instanceof HTMLButtonElement;
}

function isTextOrRangeControl(target: EventTarget | null) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

function start() {
  try {
    audio = new NightAudio();
    world = new NocturneWorld(canvas, settings, {
      onRipple: (strength: number, pan: number) => audio?.ripple(strength, pan),
      onFps: (fps: number) => app.dataset.fps = String(Math.round(fps)),
    });
    audio.update(settings.wind, settings.mood);
    renderControls();
    setLoading();
  } catch (error) {
    showFailure(error);
  }
}

(['fog', 'wind', 'fireflies', 'moonlight'] as const).forEach((key) => {
  $<HTMLInputElement>(`#${key}`).addEventListener('input', (event) => applySettings({ [key]: Number((event.currentTarget as HTMLInputElement).value) }));
});

document.querySelectorAll<HTMLButtonElement>('[data-mood]').forEach((button) => {
  button.addEventListener('click', () => applySettings({ mood: button.dataset.mood as Mood }));
});
document.querySelectorAll<HTMLButtonElement>('[data-camera]').forEach((button) => {
  button.addEventListener('click', () => applySettings({ camera: button.dataset.camera as CameraView }));
});
$<HTMLButtonElement>('#panel-close').addEventListener('click', () => setPanel(false));
directionButton.addEventListener('click', () => setPanel(!panel.classList.contains('is-open')));
pauseButton.addEventListener('click', () => applySettings({ paused: !settings.paused }));
$<HTMLButtonElement>('#reset-scene').addEventListener('click', () => {
  settings = { ...DEFAULT_SETTINGS, paused: window.matchMedia('(prefers-reduced-motion: reduce)').matches };
  world?.update(settings);
  audio?.update(settings.wind, settings.mood);
  persist();
  renderControls();
  announce('장면을 처음의 밤으로 돌렸습니다.');
});
soundButton.addEventListener('click', () => void toggleSound());
immersiveButton.addEventListener('click', () => setImmersive(!app.classList.contains('is-immersive')));
$<HTMLButtonElement>('#about-toggle').addEventListener('click', () => about.showModal());
$<HTMLButtonElement>('#about-close').addEventListener('click', () => about.close());
captureButton.addEventListener('click', () => void captureScene());
hiddenRestore.addEventListener('click', () => setImmersive(false));

canvas.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  if (settings.paused) { announce('Space를 눌러 장면을 재생한 뒤 수면을 만져보세요.'); return; }
  world?.summon();
  announce('밤이 수면에서 깨어납니다.');
});
canvas.addEventListener('nocturne-error', (event) => {
  const detail = (event as CustomEvent<unknown>).detail;
  showFailure(new Error(typeof detail === 'string' ? detail : '그래픽 장면을 유지할 수 없습니다.'));
});

document.addEventListener('keydown', (event) => {
  if (about.open) {
    if (event.key === 'Escape') about.close();
    return;
  }
  if (event.key === 'Escape') {
    if (app.classList.contains('is-immersive')) setImmersive(false);
    else if (panel.classList.contains('is-open')) setPanel(false);
    return;
  }
  if (event.code === 'Space' && isFormControl(event.target)) return;
  if (isTextOrRangeControl(event.target)) return;
  if (event.code === 'Space') {
    event.preventDefault();
    applySettings({ paused: !settings.paused });
  } else if (event.key.toLowerCase() === 'h') {
    setImmersive(!app.classList.contains('is-immersive'));
  } else if (event.key === 'Escape') {
    if (app.classList.contains('is-immersive')) setImmersive(false);
    else if (panel.classList.contains('is-open')) setPanel(false);
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    soundEnabledBeforeHidden = soundEnabled;
    if (soundEnabled) void audio?.setEnabled(false);
  } else if (soundEnabledBeforeHidden && soundEnabled) {
    void audio?.setEnabled(true).catch(() => undefined);
  }
});

window.addEventListener('beforeunload', () => {
  world?.destroy();
  audio?.destroy();
});

start();
