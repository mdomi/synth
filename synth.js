/**
 * jquery.midikeys.js
 * (c) 2012 Michael Dominice
 * jquery.midikeys.js is freely distributable under the MIT license.
 */
(function (root, factory) {
    var libaryName = 'Synth';
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

    function Oscillator(context, note, velocity) {
        var gain = context.createGainNode();
        gain.gain.value = velocity / MAX_VELOCITY;
        console.log(gain.gain.value, velocity);
        var oscillator = context.createOscillator();
        oscillator.frequency.value = midiNoteToFrequency(note);

        oscillator.connect(gain);

        this.connect = function () {
            return gain.connect.apply(gain, arguments);
        };

        this.disconnect = function () {
            return gain.disconnect.apply(gain, arguments);
        };

        this.noteOn = function () {
            return oscillator.noteOn.apply(oscillator, arguments);
        };

        this.noteOff = function () {
            return oscillator.noteOff.apply(oscillator, arguments);
        };

    }

    function Synth(context) {
        var gain = context.createGainNode();

        var oscillators = {};

        function createOscillator(note) {
            var oscillator = context.createOscillator();
            oscillator.frequency.value = midiNoteToFrequency(note);
            return oscillator;
        }
        
        function noteOn(note, velocity) {
            var key = KEY_PREFIX + note;
            if (!oscillators.hasOwnProperty(key)) {
                var oscillator = oscillators[key] = new Oscillator(context, note, velocity);
                oscillator.connect(gain);
                oscillator.noteOn(0);
            }
        }

        function noteOff(note, velocity) {
            var key = KEY_PREFIX + note;
            if (oscillators.hasOwnProperty(key)) {
                var oscillator = oscillators[key];
                oscillator.noteOff(0);
                oscillator.disconnect(0);
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

    return Synth;

}));