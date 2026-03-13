import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const API_BASE = 'https://api.elevenlabs.io/v1';
const DEFAULT_VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb';
const DEFAULT_MODEL_TTS = 'eleven_multilingual_v2';
const DEFAULT_MODEL_STT = 'scribe_v1';

export class ElevenLabsClient {
  constructor({ apiKey, voiceId, ttsModel, sttModel } = {}) {
    this.apiKey = apiKey;
    this.voiceId = voiceId || DEFAULT_VOICE_ID;
    this.ttsModel = ttsModel || DEFAULT_MODEL_TTS;
    this.sttModel = sttModel || DEFAULT_MODEL_STT;

    if (!this.apiKey) {
      console.warn('[ElevenLabs] No API key provided, audio features disabled');
    }
  }

  get enabled() {
    return !!this.apiKey;
  }

  /**
   * Speech-to-Text: transcribe an audio buffer to text.
   * Accepts Buffer or base64 string.
   */
  async transcribe(audioInput, { language } = {}) {
    if (!this.enabled) throw new Error('ElevenLabs API key not configured');

    const buffer = Buffer.isBuffer(audioInput)
      ? audioInput
      : Buffer.from(audioInput, 'base64');

    const formData = new FormData();
    formData.append('model_id', this.sttModel);
    formData.append('file', new Blob([buffer], { type: 'audio/ogg' }), 'audio.ogg');
    if (language) {
      formData.append('language_code', language);
    }

    console.log('[ElevenLabs] STT request:', { size: buffer.length, model: this.sttModel });

    const res = await fetch(`${API_BASE}/speech-to-text`, {
      method: 'POST',
      headers: { 'xi-api-key': this.apiKey },
      body: formData
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`ElevenLabs STT failed (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const text = data.text || '';
    console.log('[ElevenLabs] STT result:', { length: text.length, preview: text.slice(0, 80) });
    return text;
  }

  /**
   * Text-to-Speech: convert text to audio buffer (mp3).
   * Returns { buffer: Buffer, mimeType: string }
   */
  async synthesize(text, { voiceId, outputFormat = 'mp3_44100_128' } = {}) {
    if (!this.enabled) throw new Error('ElevenLabs API key not configured');

    const vid = voiceId || this.voiceId;
    console.log('[ElevenLabs] TTS request:', { voiceId: vid, textLength: text.length, outputFormat });

    const res = await fetch(`${API_BASE}/text-to-speech/${vid}?output_format=${outputFormat}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': this.apiKey
      },
      body: JSON.stringify({
        text,
        model_id: this.ttsModel
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`ElevenLabs TTS failed (${res.status}): ${errText}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const mimeType = outputFormat.startsWith('mp3') ? 'audio/mpeg' : 'audio/ogg';
    console.log('[ElevenLabs] TTS result:', { size: buffer.length, mimeType });

    return { buffer, mimeType };
  }

  /**
   * Convenience: synthesize to a temp file, return path.
   * Caller should clean up the file after sending.
   */
  async synthesizeToFile(text, options = {}) {
    const { buffer } = await this.synthesize(text, options);
    const ext = (options.outputFormat || 'mp3_44100_128').startsWith('mp3') ? 'mp3' : 'ogg';
    const filePath = join(tmpdir(), `tts_${Date.now()}.${ext}`);
    writeFileSync(filePath, buffer);
    return { filePath, cleanup: () => { try { unlinkSync(filePath); } catch {} } };
  }
}
