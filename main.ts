namespace musicStudio {
    const CH = "0123456789abcdefghijklmnopqrstuvwxyz"
    const TRACKS = 3
    const STEPS = 16
    const PATTERNS = 4
    const PER_PAT = 48
    const SAVE_KEY = "musicstudio-song"

    let waves = [WaveShape.Sine, WaveShape.Triangle, WaveShape.Sawtooth, WaveShape.Square, WaveShape.Noise]
    let waveNames = ["Sine", "Tri", "Saw", "Sqr", "Noise"]
    let effects = [SoundExpressionEffect.None, SoundExpressionEffect.Vibrato, SoundExpressionEffect.Tremolo, SoundExpressionEffect.Warble]
    let fxNames = ["None", "Vib", "Trem", "Warb"]
    let noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    let baseFreq = [131, 139, 147, 156, 165, 175, 185, 196, 208, 220, 233, 247]
    let trackNames = ["Lead", "Bass", "Drum"]
    let octShift = [0, 1, 0]
    let pName = ["Wave", "Vol", "End", "Slide", "Gate", "FX", "Tempo", "Len"]
    let pMin = [0, 0, 0, 20, 10, 0, 60, 1]
    let pMax = [4, 255, 255, 400, 100, 3, 500, 4]
    let pStep = [1, 15, 15, 10, 10, 1, 10, 1]

    let notes: number[] = []
    let inst: number[] = []
    let glob: number[] = []
    let clip: number[] = []
    let ready = false
    let playing = false
    let stopFlag = false
    let loopPlay = false
    let startPat = 0
    let playPat = -1
    let playStep = -1
    let cur = 0
    let pat = 0
    let trk = 0
    let param = 0
    let closed = false
    let aUsed = false
    let bUsed = false
    let status = ""
    let statusUntil = 0

    // ---------- DATA ----------
    function idx(p: number, t: number, i: number): number {
        return p * PER_PAT + t * STEPS + i
    }

    function getParam(p: number): number {
        if (p < 6) {
            return inst[trk * 6 + p]
        }
        return glob[p - 6]
    }

    function setParam(p: number, v: number) {
        if (p < 6) {
            inst[trk * 6 + p] = v
        } else {
            glob[p - 6] = v
        }
    }

    function ensureReady() {
        if (ready) {
            return
        }
        ready = true
        for (let i = 0; i < PATTERNS * PER_PAT; i++) {
            notes.push(-1)
        }
        let w = [3, 1, 4]
        for (let t = 0; t < TRACKS; t++) {
            inst.push(w[t])
            inst.push(200)
            inst.push(0)
            inst.push(100)
            inst.push(80)
            inst.push(0)
        }
        glob.push(150)
        glob.push(4)
        let saved = settings.readString(SAVE_KEY)
        if (saved) {
            deserialize(saved)
        }
    }

    function serialize(): string {
        let s = ""
        for (let j = 0; j < notes.length; j++) {
            if (notes[j] < 0) {
                s += "-"
            } else {
                s += CH.charAt(notes[j])
            }
        }
        s += ";"
        for (let k = 0; k < inst.length; k++) {
            s += "" + inst[k] + ","
        }
        s += "" + glob[0] + "," + glob[1]
        return s
    }

    function deserialize(s: string): boolean {
        let parts = s.split(";")
        if (parts.length < 2 || parts[0].length != notes.length) {
            return false
        }
        for (let l = 0; l < notes.length; l++) {
            let c = parts[0].charAt(l)
            if (c == "-") {
                notes[l] = -1
            } else {
                notes[l] = Math.constrain(CH.indexOf(c), 0, 35)
            }
        }
        let nums = parts[1].split(",")
        if (nums.length >= 20) {
            for (let u = 0; u < TRACKS; u++) {
                for (let m = 0; m < 6; m++) {
                    inst[u * 6 + m] = Math.constrain(parseInt(nums[u * 6 + m]), pMin[m], pMax[m])
                }
            }
            glob[0] = Math.constrain(parseInt(nums[18]), pMin[6], pMax[6])
            glob[1] = Math.constrain(parseInt(nums[19]), pMin[7], pMax[7])
        }
        return true
    }

    // ---------- SOUND ----------
    function playNote(t: number, n: number) {
        let b = t * 6
        let f = (baseFreq[n % 12] * (1 << Math.idiv(n, 12))) >> octShift[t]
        let f2 = Math.constrain(Math.idiv(f * inst[b + 3], 100), 1, 5000)
        let dur = Math.max(20, Math.idiv(glob[0] * inst[b + 4], 100))
        music.play(music.createSoundEffect(waves[inst[b]], f, f2, inst[b + 1], inst[b + 2], dur, effects[inst[b + 5]], InterpolationCurve.Linear), music.PlaybackMode.InBackground)
    }

    function startPlayback() {
        if (playing) {
            return
        }
        playing = true
        stopFlag = false
        control.runInParallel(function () {
            let p0 = startPat
            let endPat = Math.max(glob[1], startPat + 1)
            let again = true
            while (again && !stopFlag) {
                for (let p = p0; p < endPat; p++) {
                    for (let n = 0; n < STEPS; n++) {
                        if (stopFlag) {
                            break
                        }
                        playPat = p
                        playStep = n
                        for (let v = 0; v < TRACKS; v++) {
                            let o = notes[idx(p, v, n)]
                            if (o >= 0) {
                                playNote(v, o)
                            }
                        }
                        pause(glob[0])
                    }
                    if (stopFlag) {
                        break
                    }
                }
                p0 = 0
                endPat = glob[1]
                again = loopPlay
            }
            playStep = -1
            playPat = -1
            playing = false
        })
    }

    // ---------- EDITOR ----------
    function showStatus(text: string) {
        status = text
        statusUntil = game.runtime() + 800
    }

    function noteLabel(): string {
        let q = notes[idx(pat, trk, cur)]
        if (q < 0) {
            return "rest"
        }
        return noteNames[q % 12] + (3 + Math.idiv(q, 12) - octShift[trk])
    }

    function previewNote() {
        let r = notes[idx(pat, trk, cur)]
        if (r < 0) {
            r = 12
        }
        playNote(trk, r)
    }

    function changeNote(dir: number) {
        let a = idx(pat, trk, cur)
        let d = notes[a]
        if (d < 0) {
            d = 12
        } else {
            d = Math.constrain(d + dir, 0, 35)
        }
        notes[a] = d
        playNote(trk, d)
    }

    function toggleNote() {
        let e = idx(pat, trk, cur)
        if (notes[e] < 0) {
            notes[e] = 12
            playNote(trk, 12)
        } else {
            notes[e] = -1
        }
    }

    function changeParam(dir: number) {
        let g = getParam(param) + dir * pStep[param]
        if (param == 0 || param == 5) {
            let span = pMax[param] + 1
            g = (getParam(param) + dir + span) % span
        }
        setParam(param, Math.constrain(g, pMin[param], pMax[param]))
        previewNote()
    }

    function chord(d: number) {
        if (d == 0) {
            clip = []
            for (let h = 0; h < PER_PAT; h++) {
                clip.push(notes[pat * PER_PAT + h])
            }
            showStatus("Copied!")
        } else if (d == 1) {
            if (clip.length == PER_PAT) {
                for (let k2 = 0; k2 < PER_PAT; k2++) {
                    notes[pat * PER_PAT + k2] = clip[k2]
                }
                showStatus("Pasted!")
            } else {
                showStatus("Copy first")
            }
        } else if (d == 2) {
            for (let k3 = 0; k3 < PER_PAT; k3++) {
                notes[pat * PER_PAT + k3] = -1
            }
            showStatus("Cleared")
        } else {
            closed = true
        }
    }

    function onDir(d: number) {
        let a2 = controller.A.isPressed()
        let b2 = controller.B.isPressed()
        if (a2 && b2) {
            aUsed = true
            bUsed = true
            chord(d)
        } else if (a2) {
            aUsed = true
            if (d == 0) {
                param = (param + 7) % 8
            } else if (d == 1) {
                param = (param + 1) % 8
            } else if (d == 2) {
                changeParam(-1)
            } else {
                changeParam(1)
            }
        } else if (b2) {
            bUsed = true
            if (d == 0) {
                trk = (trk + 2) % TRACKS
            } else if (d == 1) {
                trk = (trk + 1) % TRACKS
            } else if (d == 2) {
                pat = (pat + 3) % PATTERNS
            } else {
                pat = (pat + 1) % PATTERNS
            }
        } else {
            if (d == 0) {
                changeNote(1)
            } else if (d == 1) {
                changeNote(-1)
            } else if (d == 2) {
                cur = (cur + 15) % STEPS
            } else {
                cur = (cur + 1) % STEPS
            }
        }
    }

    function registerControls() {
        controller.up.onEvent(ControllerButtonEvent.Pressed, function () {
            onDir(0)
        })
        controller.down.onEvent(ControllerButtonEvent.Pressed, function () {
            onDir(1)
        })
        controller.left.onEvent(ControllerButtonEvent.Pressed, function () {
            onDir(2)
        })
        controller.right.onEvent(ControllerButtonEvent.Pressed, function () {
            onDir(3)
        })
        controller.A.onEvent(ControllerButtonEvent.Pressed, function () {
            aUsed = false
            if (controller.B.isPressed()) {
                aUsed = true
                bUsed = true
            }
        })
        controller.A.onEvent(ControllerButtonEvent.Released, function () {
            if (!aUsed) {
                toggleNote()
            }
        })
        controller.B.onEvent(ControllerButtonEvent.Pressed, function () {
            bUsed = false
            if (controller.A.isPressed()) {
                aUsed = true
                bUsed = true
            }
        })
        controller.B.onEvent(ControllerButtonEvent.Released, function () {
            if (!bUsed) {
                if (playing) {
                    stopFlag = true
                } else {
                    startPat = pat
                    loopPlay = false
                    startPlayback()
                }
            }
        })
    }

    function valueText(j: number): string {
        let v2 = getParam(j)
        if (j == 0) {
            return waveNames[v2]
        }
        if (j == 5) {
            return fxNames[v2]
        }
        if (j == 3 || j == 4) {
            return "" + v2 + "%"
        }
        if (j == 6) {
            return "" + v2 + "ms"
        }
        return "" + v2
    }

    function drawStudio() {
        screen.print("P" + (pat + 1) + "/4 " + trackNames[trk] + " " + noteLabel(), 2, 1, 1)
        if (game.runtime() < statusUntil) {
            screen.print(status, 100, 1, 5)
        }
        for (let i2 = 0; i2 < STEPS; i2++) {
            let x = 8 + i2 * 9
            let hot = playing && playPat == pat && playStep == i2
            for (let t2 = 0; t2 < TRACKS; t2++) {
                let n2 = notes[idx(pat, t2, i2)]
                if (t2 != trk && n2 >= 0) {
                    screen.fillRect(x, 68 - (3 + Math.idiv(n2 * 3, 2)), 7, 1, 11)
                }
            }
            let n3 = notes[idx(pat, trk, i2)]
            let col = 9
            if (hot) {
                col = 5
            }
            if (n3 >= 0) {
                let h2 = 3 + Math.idiv(n3 * 3, 2)
                screen.fillRect(x, 68 - h2, 7, h2, col)
            } else {
                if (!hot) {
                    col = 12
                }
                screen.fillRect(x, 67, 7, 2, col)
            }
            let tick = 12
            if (i2 % 4 == 0) {
                tick = 6
            }
            screen.fillRect(x, 72, 7, 1, tick)
        }
        screen.drawRect(8 + cur * 9 - 1, 11, 9, 59, 1)
        for (let j2 = 0; j2 < 8; j2++) {
            let c2 = 1
            if (j2 == param) {
                c2 = 5
            }
            screen.print(pName[j2] + ":" + valueText(j2), 4 + (j2 % 2) * 80, 76 + Math.idiv(j2, 2) * 9, c2)
        }
        screen.print("A edit  B nav  A+B more", 4, 112, 6)
    }

    // ---------- BLOCKS ----------
    //% block="open music studio"
    //% weight=100
    export function openStudio() {
        ensureReady()
        if (playing) {
            stopFlag = true
            pauseUntil(() => !playing)
        }
        game.pushScene()
        scene.setBackgroundColor(15)
        closed = false
        cur = 0
        pat = 0
        trk = 0
        param = 0
        registerControls()
        game.onPaint(function () {
            drawStudio()
        })
        pauseUntil(() => closed)
        stopFlag = true
        let data = serialize()
        settings.writeString(SAVE_KEY, data)
        console.log(data)
        game.popScene()
    }

    //% block="play saved studio song"
    //% weight=90
    export function playSavedSong() {
        ensureReady()
        startPat = 0
        loopPlay = false
        startPlayback()
    }

    //% block="loop saved studio song"
    //% weight=89
    export function loopSavedSong() {
        ensureReady()
        startPat = 0
        loopPlay = true
        startPlayback()
    }

    //% block="stop studio song"
    //% weight=80
    export function stopSong() {
        stopFlag = true
    }

    //% block="play studio song from text %text"
    //% text.defl="paste export text here"
    //% weight=70
    export function playFromText(text: string) {
        ensureReady()
        if (deserialize(text)) {
            startPat = 0
            loopPlay = false
            startPlayback()
        }
    }
}
