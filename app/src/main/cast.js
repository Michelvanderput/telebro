const { Client, DefaultMediaReceiver } = require('castv2-client');
const { Bonjour } = require('bonjour-service');
const { EventEmitter } = require('events');

class CastController extends EventEmitter {
  constructor() {
    super();
    this.bonjour = new Bonjour();
    this.devices = new Map();
    this.client = null;
    this.player = null;
    this.host = null;
  }

  discover() {
    if (this.browser) this.browser.stop();
    this.browser = this.bonjour.find({ type: 'googlecast' }, (svc) => {
      const host = (svc.addresses || []).find((a) => /^\d+\.\d+\.\d+\.\d+$/.test(a));
      if (!host) return;
      const name = (svc.txt && (svc.txt.fn || svc.txt.md)) || svc.name;
      this.devices.set(host, { host, name, model: svc.txt && svc.txt.md });
      this.emit('devices', [...this.devices.values()]);
    });
  }

  list() { return [...this.devices.values()]; }

  async connect(host) {
    if (this.client && this.host === host && this.player) return;
    await this.disconnect();
    await new Promise((resolve, reject) => {
      const client = new Client();
      client.on('error', (e) => { this.emit('error', e); this.client = null; this.player = null; });
      client.connect(host, () => {
        client.launch(DefaultMediaReceiver, (err, player) => {
          if (err) return reject(err);
          this.client = client; this.player = player; this.host = host;
          player.on('status', (s) => this.emit('status', s));
          resolve();
        });
      });
      client.once('error', reject);
    });
  }

  // media: { url, contentType, streamType, duration, title, tracks:[{url,name,language}], activeTrack, startAt }
  load(media) {
    const tracks = (media.tracks || []).map((t, i) => ({
      trackId: i + 1, type: 'TEXT', trackContentType: 'text/vtt', trackContentId: t.url,
      subtype: 'SUBTITLES', name: t.name, language: t.language,
    }));
    const info = {
      contentId: media.url, contentType: media.contentType, streamType: media.streamType || 'BUFFERED',
      duration: media.duration, metadata: { type: 0, metadataType: 0, title: media.title }, tracks,
      textTrackStyle: { backgroundColor: '#00000099', foregroundColor: '#FFFFFFFF', edgeType: 'DROP_SHADOW', fontScale: 1.1 },
    };
    return new Promise((resolve, reject) => {
      this.player.load(info, {
        autoplay: true, currentTime: media.startAt || 0,
        activeTrackIds: media.activeTrack ? [media.activeTrack] : [],
      }, (err, status) => (err ? reject(err) : resolve(status)));
    });
  }

  _call(fn, ...args) {
    return new Promise((resolve, reject) => {
      if (!this.player) return reject(new Error('Niet verbonden met een tv'));
      this.player[fn](...args, (err, s) => (err ? reject(err) : resolve(s)));
    });
  }
  play() { return this._call('play'); }
  pause() { return this._call('pause'); }
  seek(t) { return this._call('seek', t); }
  stop() { return this._call('stop'); }
  setSubtitle(trackId) {
    return new Promise((resolve, reject) => {
      if (!this.player) return reject(new Error('Niet verbonden met een tv'));
      this.player.media.sessionRequest({ type: 'EDIT_TRACKS_INFO', activeTrackIds: trackId ? [trackId] : [] },
        (err) => (err ? reject(err) : resolve()));
    });
  }
  setVolume(level) {
    return new Promise((resolve, reject) => {
      if (!this.client) return reject(new Error('Niet verbonden'));
      this.client.setVolume({ level: Math.max(0, Math.min(1, level)) }, (e) => (e ? reject(e) : resolve()));
    });
  }

  async disconnect() {
    if (this.client) { try { this.client.close(); } catch {} }
    this.client = null; this.player = null; this.host = null;
  }
}

module.exports = { CastController };
