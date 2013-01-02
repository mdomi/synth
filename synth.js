/**
 * jquery.midikeys.js
 * (c) 2012 Michael Dominice
 * jquery.midikeys.js is freely distributable under the MIT license.
 */
(function (root, factory) {
    var libaryName = 'synth';
    if (typeof define !== 'undefined' && define.amd) {
        define([], function () {
            return root[libaryName] = factory();
        });
    } else {
        return root[libaryName] = factory();
    }
}(this, function () {

    var NOTE_ON = 0x90,
        NOTE_OFF = 0x80,
        MAX_VELOCITY = 0x7f;
        KEY_PREFIX = 'oscillator';

    function midiNoteToFrequency(note) {
        return 440 * Math.pow(2, (note - 69) / 12.0);
    }

    function extend(result) {
        var key, i;
        for (i = 1; i < arguments.length; i++) {
            for (key in arguments[i]) {
                if (arguments[i].hasOwnProperty(key)) {
                    result[key] = arguments[i][key];
                }
            }
        }
        return result;
    }

    function ADSREnvelope(context, options) {
        options = extend({}, ADSREnvelope.defaults, options);

        this.noteOn = function (param) {
            param.cancelScheduledValues(context.currentTime - 0.1);
            if (options.attack === 0) {
                param.setValueAtTime(options.max, context.currentTime);
            } else {
                param.setValueAtTime(options.min, context.currentTime);
                param.linearRampToValueAtTime(options.max, context.currentTime + options.attack);
            }

            if (options.decay !== 0) {
                param.linearRampToValueAtTime(options.sustain * options.max, context.currentTime + options.attack + options.decay);
            }
        };

        this.noteOff = function (param) {
            param.cancelScheduledValues(context.currentTime - 0.1);
            if (options.release === 0) {
                param.setValueAtTime(options.min, context.currentTime);
            } else {
                param.linearRampToValueAtTime(options.min, context.currentTime + options.release);
            }
        };
    }

    ADSREnvelope.defaults = {
        max : 1.0,
        min : 0.0,
        attack : 0,
        decay : 0,
        sustain : 1.0,
        release : 0
    };

    function Oscillator(context, note, options) {
        var opts = extend({}, Oscillator.defaults, options);
        var maxGain = opts.velocity / MAX_VELOCITY;
        
        var volumeEnvelopeOptions = extend({}, opts.volumeEnvelope, {
            max : maxGain
        });
        
        var gain = context.createGainNode();
        var oscillator = context.createOscillator();
        
        var volumeEnvelope = new ADSREnvelope(context, volumeEnvelopeOptions);
        oscillator.frequency.value = midiNoteToFrequency(note);

        oscillator.connect(gain);

        this.connect = function () {
            return gain.connect.apply(gain, arguments);
        };

        this.disconnect = function () {
            return gain.disconnect.apply(gain, arguments);
        };

        this.noteOn = function () {
            volumeEnvelope.noteOn(gain.gain);
            return oscillator.noteOn.apply(oscillator, arguments);
        };

        this.noteOff = function () {
            volumeEnvelope.noteOff(gain.gain);
            // oscillator.noteOff(context.currentTime + (volumeEnvelopeOptions.release || 0));
        };

    }

    Oscillator.defaults = {
        velocity : MAX_VELOCITY,
        volumeEnvelope : extend({}, ADSREnvelope.defaults)
    };

    function Synth(context, opts) {
        var options = extend({}, Synth.defaults, opts);
        var gain = context.createGainNode();

        var oscillators = {};

        function createOscillator(note) {
            var oscillator = context.createOscillator();
            oscillator.type = options.type;
            oscillator.frequency.value = midiNoteToFrequency(note);
            oscillator.type = options.type;
            return oscillator;
        }
        
        function noteOn(note, velocity) {
            var key = KEY_PREFIX + note;
            if (!oscillators.hasOwnProperty(key)) {
                var oscillator = oscillators[key] = new Oscillator(context, note, {
                    velocity : velocity,
                    volumeEnvelope : options.volumeEnvelope
                });
                oscillator.connect(gain);
                oscillator.noteOn(0);
            }
        }

        function noteOff(note, velocity) {
            var key = KEY_PREFIX + note;
            if (oscillators.hasOwnProperty(key)) {
                var oscillator = oscillators[key];
                oscillator.noteOff();
                //oscillator.disconnect(0);
                delete oscillators[key];
            }
        }

        this.send = function (data, timestamp) {
            var status = (data[0] & 0xf0);
            switch (status) {
                case NOTE_ON:
                noteOn(data[1], data[2]);
                break;
                case NOTE_OFF:
                noteOff(data[1], data[2]);
                break;
            }
        };

        this.connect = function (destination) {
            return gain.connect(destination);
        };
    }

    extend(Synth, {
        SINE : 0,
        SQUARE : 1,
        SAWTOOTH : 2,
        TRIANGLE : 3
    });

    Synth.defaults = {
        type : Synth.SINE
    };

    return {
        Synth : Synth
    };

}));