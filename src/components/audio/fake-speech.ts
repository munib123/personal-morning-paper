// A fake speechSynthesis for the dom tests of the audio components (not shipped: only tests import it).
import type { SynthLike, UtteranceLike } from '@/lib/audio/player';

export class FakeUtterance implements UtteranceLike {
  text: string;
  lang = '';
  rate = 1;
  voice: SpeechSynthesisVoice | null = null;
  onstart: SpeechSynthesisUtterance['onstart'] = null;
  onend: SpeechSynthesisUtterance['onend'] = null;
  onerror: SpeechSynthesisUtterance['onerror'] = null;
  constructor(text = '') {
    this.text = text;
  }
}

export class FakeSynth implements SynthLike {
  pending: FakeUtterance[] = [];
  history: FakeUtterance[] = [];
  calls: string[] = [];
  paused = false;
  voices: SpeechSynthesisVoice[] = [{ name: 'Google UK English Female', lang: 'en-GB', default: true, localService: false, voiceURI: 'g' } as SpeechSynthesisVoice];
  get speaking() {
    return this.pending.length > 0;
  }
  speak(u: UtteranceLike) {
    this.pending.push(u as FakeUtterance);
    this.history.push(u as FakeUtterance);
  }
  cancel() {
    this.calls.push('cancel');
    const dropped = this.pending.splice(0);
    this.paused = false;
    for (const u of dropped) u.onerror?.call(u as unknown as SpeechSynthesisUtterance, { error: 'interrupted' } as SpeechSynthesisErrorEvent);
  }
  pause() {
    this.calls.push('pause');
    this.paused = true;
  }
  resume() {
    this.calls.push('resume');
    this.paused = false;
  }
  getVoices() {
    return this.voices;
  }
  /** Ends every utterance queued right now (not what the player queues in response). */
  endStory() {
    const batch = this.pending.slice();
    for (const u of batch) {
      if (this.pending[0] !== u) break;
      this.pending.shift();
      u.onend?.call(u as unknown as SpeechSynthesisUtterance, {} as SpeechSynthesisEvent);
    }
  }
}
