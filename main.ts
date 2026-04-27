/*
File:       github.com/ETmbit/arbiter-remote.ts
Version:	2026-1
Copyright:  ElecTricks, 2026
License:    GNU GPL 3 or later
Disclaimer: Distributed without any warranty
*/

//////////////////
//  INCLUDE     //
//  etradio.ts  //
//////////////////

// the micro:bit radio buffer size is 19 bytes only
// therefore, messages are sent in chunks
// the chunk format is: id|ix|chunk
// the final chunk has ix=-1 and chunk=ack_id
// a receiver 

//##### GROUP HANDLING #####\\

const ET_EVENT = 200 + Math.randomRange(0, 100) // semi-unique id

let ETgroup = 1
let ETgroupTimer = 0
let ETgroupSet = false
let ETgroupHandlers: ((group: number) => void)[] = []

function etHandleGroup() {
    basic.showNumber(ETgroup)
    if (ETgroupHandlers.length) {
        for (let ix = 0; ix < ETgroupHandlers.length; ix++)
            ETgroupHandlers[ix](ETgroup)
    }
    else
        basic.showIcon(IconNames.Yes)
}

control.onEvent(ET_EVENT, 0, function () {
    while (ETgroupTimer > control.millis()) { basic.pause(1) }
    etHandleGroup()
    ETgroupTimer = 0
    ETgroupSet = false
})

input.onLogoEvent(TouchButtonEvent.Pressed, function () {
    if (ETgroupSet) {
        ETgroup++
        if (ETgroup > 9) ETgroup = 1
        radio.setGroup(ETgroup)
    }
    else
        ETgroupSet = true
    basic.showNumber(ETgroup)
    if (!ETgroupTimer) {
        ETgroupTimer = control.millis() + 1000
        control.raiseEvent(ET_EVENT, 0)
    }
    else
        ETgroupTimer = control.millis() + 1000
})

//##### DATA HANDLING #####\\

const ET_EOM = -1
const ET_ACK = -2

interface ETradioMessages {
	sent:     string[]  // id's of sent messages that have no ACK yet
	received: string[]	// received messages that have not been read yet
	chunks:   string[]	// temporary buffer for received chunks
	handler:  (message: string) => void // will be called when a radio message is received
}

let ETradioMsg: { [id: string]: ETradioMessages } = {}

radio.onReceivedString(function (chunk: string) {

	let parts = chunk.split("|")
	if (parts.length != 3) return
	let id = parts[0]
	let ix = +parts[1]
	let msg = parts[2]

	// create a buffer for id if not existing
	etradio.createBuffer(id)

	// EOM handling (receiver side)
	// (1) send ACK
	// (2) store message or call handler
	// see: etradio.send()
	if (ix === ET_EOM) {
		// (1) msg contains msg id
		msg = id + "|" + ET_ACK.toString() + "|" + msg
		radio.sendString(msg)
		// (2)
		msg = ETradioMsg[id].chunks.join("")
		if (ETradioMsg[id].handler)
			ETradioMsg[id].handler(msg)
		else
			ETradioMsg[id].received.push(msg)
		ETradioMsg[id].chunks = []
		return
	}

	// ACK handling (sender side)
	// (1) clear the ACK flag when acknowledged
	// see: etradio.send()
	if (ix === ET_ACK) {
        if (ETradioMsg[id] && ((ix = ETradioMsg[id].sent.indexOf(msg)) >= 0))
            // (1)
            ETradioMsg[id].sent.splice(ix, 1)
		return
	}

	// CHUNK handling (receiver side)
    ETradioMsg[id].chunks[ix] = msg
})

namespace etradio {

	export function createBuffer(id: string) {
		if (!ETradioMsg[id])
			ETradioMsg[id] = {sent: [], received: [], chunks: [], handler: null}
	}

	export function clearBuffer(id: string) {
		if (ETradioMsg[id])
			delete ETradioMsg[id]
	}

	export function send(id: string, msg: string, timeout: number = 0) {
		// messages are broadcasted

		let len = Math.max(1, 15 - id.length)
		let ix = 0
		let chunk = ""
        let ack_id = control.millis().toString() + Math.randomRange(0, 999).toString()
        ack_id = ack_id.substr(0, len)

		// create a buffer for id if not existing
		createBuffer(id)

		// send message in chunks
		while (msg.length > 0) {
			chunk = id + "|" + ix.toString() + "|" + msg.substr(0, len)
			msg = msg.substr(len)
			radio.sendString(chunk)
			basic.pause(1)
            ix += 1
		}

		// (1) raise ACK flag
		// (2) sent ack_id so that receiver can ACK
		// (3) wait for ACK flag being cleared by radio.onReceivedString
		// (4) clear ACK flag in case of timeout
		// Not fully fail save, but best in terms of successfull transmission
		// Timeout is the savety net
		// After timeout clear the ACK flag anyway

		// (1)
		ETradioMsg[id].sent.push(ack_id)

		// (2)
		chunk = id + "|" + ET_EOM.toString() + "|" + ack_id
		radio.sendString(chunk)

		// (3)
		let tm = control.millis() + timeout
		while (control.millis() < tm && ETradioMsg[id].sent.indexOf(ack_id) >= 0)
			basic.pause(1)

		// (4)
		if ((ix = ETradioMsg[id].sent.indexOf(ack_id)) >= 0)
			ETradioMsg[id].sent.splice(ix, 1)
	}

	export function available(id: string) : boolean {
		return !!(ETradioMsg[id] && (ETradioMsg[id].received.length > 0))
	}

	export function read(id: string) : string {
		if (!ETradioMsg[id] || !ETradioMsg[id].received.length)
			return ""
		let msg = ETradioMsg[id].received.shift()
		return msg
	}

	export function registerMessageHandler(id: string, handler: (msg: string) => void) {
		createBuffer(id)
		ETradioMsg[id].handler = handler
	}

	export function registerGroupHandler(handler: (group: number) => void) {
        ETgroupHandlers.push(handler)
	}
}

///////////////////
//  END INCLUDE  //
///////////////////

//////////////////
//  INCLUDE     //
//  etinput.ts  //
//////////////////

let ETstartHandlers: (() => void)[] = []
let ETstopHandlers: (() => void)[] = []

input.onButtonPressed(Button.A, function () {
    for (let ix = 0; ix < ETstartHandlers.length; ix++)
        ETstartHandlers[ix]()
})

input.onButtonPressed(Button.B, function () {
    for (let ix = 0; ix < ETstopHandlers.length; ix++)
        ETstopHandlers[ix]()
})

namespace etinput {

    export function registerStartHandler(handler: () => void) {
        ETstartHandlers.push(handler)
    }

    export function registerStopHandler(handler: () => void) {
        ETstopHandlers.push(handler)
    }
}

///////////////////
//  END INCLUDE  //
///////////////////

//////////////////
//  INCLUDE     //
//  etmatch.ts  //
//////////////////

const ET_MATCHID = "MA"

const ET_START = "sta"
const ET_STOP = "sto"
const ET_PAUSE = "pau"
const ET_POINT = "poi"
const ET_PENALTY = "pen" // penalty point

enum ETmatchStatus {
	Stopped,
	Playing,
	Paused,
}
let ETmatch = ETmatchStatus.Stopped

enum ETmatchPosition {
    //% block="in the field"
    //% block.loc.nl="in het veld"
    InField,
    //% block="on the border"
    //% block.loc.nl="op de lijn"
    OnBorder,
    //% block="outside the field"
    //% block.loc.nl="buiten het veld"
    OutsideField,
}
let ETplayerPosition = ETmatchPosition.InField

interface ETmatchPlayer {
	points:	number
}
let ETmatchPlayers: {[player:string]:ETmatchPlayer} = {} // interface to all players
let ETplayers: string[] = [] // list of all players
let ETplayer = ""            // current player

let etMatchPositionHandler: ()=>void
let etMatchInFieldHandler: ()=>void
let etMatchOnBorderHandler: ()=>void
let etMatchOutsideFieldHandler: ()=>void

let etMatchStopHandler: ()=>void
let etMatchPointHandler: (points: number)=>void
let etMatchWinnerHandler: ()=>void

function etMatchStart() {
    ETmatch = ETmatchStatus.Playing // activates playing in basic.forever
}
etinput.registerStartHandler(etMatchStart)

function etMatchStop() {
    ETmatch = ETmatchStatus.Stopped // deactivate playing in basic.forever
    if (etMatchStopHandler) etMatchStopHandler() // must be registered by extensions
}
etinput.registerStopHandler(etMatchStop)

function etMatchMessageHandler(message: string) {
    let command = ""
    let player = ""
    let ix = message.indexOf(":")
    if (ix < 0) {
        command = message
    }
    else {
        command = message.substr(0, ix)
        player = message.substr(ix + 1)
        if (!ETmatchPlayers[player]) {
            // subscribe player
            ETplayers.push(player)
            ETmatchPlayers[player] = { points: 0 }
        }
    }

    if (command == ET_START) {
        if (etMatchStart) etMatchStart()
    }

    if (command == ET_PAUSE) {
        ETmatch = ETmatchStatus.Paused
    }

    if (command == ET_STOP) {
        if (etMatchStop) etMatchStop()

        // celebrate the winner
        if (etMatchWinnerHandler) {
            let winner: string[] = []
            let current: string
            let hipoints = 0
            for (let ix = 0; ix < ETplayers.length; ix++) {
                current = ETplayers[ix]
                if (!ETmatchPlayers[current]) continue
                if ( ETmatchPlayers[current].points > hipoints) {
                    winner = []
                    hipoints = ETmatchPlayers[current].points
                }
                if (ETmatchPlayers[current].points === hipoints)
                    winner.push(current)
            }
            for (let ix = 0; ix < winner.length; ix++)
                if (winner[ix] === ETplayer) {
                    etMatchWinnerHandler()
                    break
                }
        }
        // clear all points
        for (let ix = 0; ix < ETplayers.length; ix++)
            if (ETmatchPlayers[ETplayers[ix]])
                ETmatchPlayers[ETplayers[ix]].points = 0
    }

    if (command == ET_POINT) {
        ETmatch = ETmatchStatus.Paused
        // count and celebrate the point
        if (ETmatchPlayers[player]) {
            ETmatchPlayers[player].points += 1
            // player extension has (ETplayer == "<player id>")
            // arbiter app has (ETplayer == "")
            if ((ETplayer == player || ETplayer == "") && etMatchPointHandler)
                etMatchPointHandler(ETmatchPlayers[player].points)
        }
    }

    if (command == ET_PENALTY) {
        if (ETmatchPlayers[player] && (ETmatchPlayers[player].points > 0)) {
            ETmatchPlayers[player].points -= 1
            if ((player == ETplayer || ETplayer == "") && etMatchPointHandler)
                etMatchPointHandler(ETmatchPlayers[player].points)
        }
    }
}
etradio.registerMessageHandler(ET_MATCHID, etMatchMessageHandler)

basic.forever(function() {
    if (ETmatch != ETmatchStatus.Playing) return
    if (!etMatchPositionHandler) return
    etMatchPositionHandler()
    switch (ETplayerPosition) {
        case ETmatchPosition.InField:
            if (!etMatchInFieldHandler) return
            etMatchInFieldHandler()
            break
        case ETmatchPosition.OnBorder:
            if (!etMatchOnBorderHandler) return
            etMatchOnBorderHandler()
            break
        case ETmatchPosition.OutsideField:
            etMatchStop()
            break
    }
})

//% color="#00CC00" icon="\uf091"
//% block="Match"
//% block.loc.nl="Wedstrijd"
namespace etmatch {

    export function isPlaying() : boolean {
        return (ETmatch === ETmatchStatus.Playing)
    }

    export function isPaused() : boolean {
        return (ETmatch === ETmatchStatus.Paused)
    }

    export function isStopped() : boolean {
        return (ETmatch === ETmatchStatus.Stopped)
    }

    export function start() {
        etradio.send(ET_MATCHID, ET_START)
        etMatchStart()
    }

    export function pause() {
        etradio.send(ET_MATCHID, ET_PAUSE)
        ETmatch = ETmatchStatus.Paused
    }

    export function stop() {
        etradio.send(ET_MATCHID, ET_STOP)
        etMatchStop()
    }

    export function point(player: string) {
        etradio.send(ET_MATCHID, ET_POINT + ":" + player)
        if (ETmatchPlayers[player])
            ETmatchPlayers[player].points += 1
        if (etMatchPointHandler) etMatchPointHandler(ETmatchPlayers[player].points)
    }

    export function penaltyPoint(player: string) {
        etradio.send(ET_MATCHID, ET_PENALTY + ":" + player)
        if (ETmatchPlayers[player] && (ETmatchPlayers[player].points > 0))
            ETmatchPlayers[player].points -= 1
        if (etMatchPointHandler) etMatchPointHandler(ETmatchPlayers[player].points)
    }

    //% block="subscribe player %player"
    //% block.loc.nl="schrijf speler %player in"
    export function subscribe(player: string) {
        ETplayer = player
        if (!ETmatchPlayers[player]) {
            ETplayers.push(player)
            ETmatchPlayers[player] = { points: 0 }
        }
    }

    //% color="#802080"
    //% block="code for celebrating the winning"
    //% block.loc.nl="code om het winnen te vieren"
    export function onWinner(code: () => void): void {
        etMatchWinnerHandler = code
    }

    //% color="#802080"
    //% block="code for celebrating a point"
    //% block.loc.nl="code om een punt te vieren"
    export function onPoint(code: (points: number) => void) {
        etMatchPointHandler = code
    }

    //% color="#802080"
    //% block="when on the border, do"
    //% block.loc.nl="wanneer op de lijn, doe"
    export function onOnBorder(code: () => void) {
        etMatchOnBorderHandler = code
    }

    //% color="#802080"
    //% block="when in the field, do"
    //% block.loc.nl="wanneer in het veld, doe"
    export function onInField(code: () => void) {
        etMatchInFieldHandler = code
    }

    //% block="the player is %pos"
    //% block.loc.nl="the speler is %pos"
    export function playerPosition(pos: ETmatchPosition) {
        ETplayerPosition = pos
    }

    //% color="#802080"
    //% block="check where is the player"
    //% block.loc.nl="controleer waar de speler"
    export function onCheckPosition(code: () => void) {
        etMatchPositionHandler = code
    }

    // registering should be done by the extension
    export function registerStopHandler(handler: () => void) {
        etMatchStopHandler = handler
    }
}

///////////////////
//  END INCLUDE  //
///////////////////

let ETplayTime = 5
let ETgameOverTime = 0
let ETtime = 0 // remaining time in minutes
let ETobstructionTimer = 0
let ETobstruction = false

pins.setPull(DigitalPin.P5, PinPullMode.PullUp)
pins.setPull(DigitalPin.P8, PinPullMode.PullUp)
pins.setPull(DigitalPin.P9, PinPullMode.PullUp)
pins.setPull(DigitalPin.P11, PinPullMode.PullUp)
pins.setPull(DigitalPin.P12, PinPullMode.PullUp)
pins.setPull(DigitalPin.P13, PinPullMode.PullUp)
pins.setPull(DigitalPin.P14, PinPullMode.PullUp)
pins.setPull(DigitalPin.P15, PinPullMode.PullUp)

const PIN_START_PLAY = DigitalPin.P5
const PIN_STOP_PLAY = DigitalPin.P8
const PIN_START_COUNTER = DigitalPin.P15
const PIN_STOP_COUNTER = DigitalPin.P9
const PIN_POINT_GREEN = DigitalPin.P11
const PIN_POINT_BLUE = DigitalPin.P14
const PIN_PENAL_GREEN = DigitalPin.P12
const PIN_PENAL_BLUE = DigitalPin.P13

const ET_BLUE = "BLU"
const ET_GREEN = "GRN"

etmatch.subscribe(ET_GREEN)
etmatch.subscribe(ET_BLUE)
ETplayers.push(ET_GREEN)
ETplayers.push(ET_BLUE)
ETplayer = "" // arbiter must have empty player

function whistle(cnt: number = 1) {
    while (cnt) {
        for (let i = 0; i < 30; i++) {
            music.ringTone(3000)
            basic.pause(8)
            music.stopAllSounds()
            basic.pause(8)
        }
        basic.pause(250)
        cnt--
    }
}

function showStatus() {
    if (ETobstructionTimer) // a count down is displayed instead
        return
    if (etmatch.isPaused())
        basic.showString("P")
    else
    if (etmatch.isPlaying())
        basic.showNumber(ETtime)
    else
        basic.showString("A")
}

function init() {
    ETobstructionTimer = 0
    ETgameOverTime = 0
    ETtime = 0
    showStatus()
}
init()

function pointHandler() {
    whistle()
    etmatch.pause()
    showStatus()
}
etmatch.onPoint(pointHandler)

// obstruction timer routine
control.runInParallel(function () {
    let tm = 0
    let prevtm = 0
    while (true) {
        basic.pause(1)
        if (!ETobstructionTimer) continue
        if (ETobstructionTimer < control.millis()) {
            ETobstruction = true
            ETobstructionTimer = 0
            prevtm = 0
            continue
        }
        tm = Math.floor((ETobstructionTimer - control.millis()) / 1000)
        if (tm !== prevtm) {
            basic.showNumber(tm)
            prevtm = tm
        }
    }
})

basic.forever(function () {
    if (ETobstruction) {
        // set by the obstruction timer routine
        ETobstruction = false
        whistle()
        etmatch.pause()
        showStatus()
        return
    }

    if (etmatch.isPlaying()) {
        ETtime = Math.floor((ETgameOverTime - control.millis()) / 60000) + 1
        if (!ETtime) {
            // game over
            whistle(3)
            etmatch.stop()
        }
        showStatus()
    }

    if (!(pins.digitalReadPin(PIN_START_PLAY))) {
        // start playing
        whistle()
        if (etmatch.isStopped()) {
            ETgameOverTime = control.millis() + ETplayTime * 60000
            ETtime = ETplayTime
        }
        etmatch.start()
        showStatus() // + debounce
    }

    if (!(pins.digitalReadPin(PIN_STOP_PLAY))) {
        if (etmatch.isPaused()) {
            // reset playing
            etmatch.stop()
            init()
        }
        else {
            // pause playing
            whistle()
            etmatch.pause()
        }
        showStatus() // + debounce
    }

    if (!etmatch.isPlaying()) return

    if (!(pins.digitalReadPin(PIN_START_COUNTER))) {
        // start obstruction count down
        ETobstructionTimer = control.millis() + 10000
        basic.pause(500) // debounce
    }
    else
    if (!(pins.digitalReadPin(PIN_STOP_COUNTER))) {
        // abort obstruction count down
        ETobstructionTimer = 0
        basic.pause(500) // debounce
    }
    else
    if (!(pins.digitalReadPin(PIN_POINT_GREEN))) {
        // point green
        etmatch.point(ET_GREEN)
    }
    else
    if (!(pins.digitalReadPin(PIN_POINT_BLUE))) {
        // point blue
        etmatch.point(ET_BLUE)
    }
    else
    if (!(pins.digitalReadPin(PIN_PENAL_GREEN))) {
        // penalty point green
        etmatch.penaltyPoint(ET_GREEN)
    }
    else
    if (!(pins.digitalReadPin(PIN_PENAL_BLUE))) {
        // penalty point blue
        etmatch.penaltyPoint(ET_BLUE)
    }
})

//% color="#00CC00" icon="\uf091"
//% block="Arbiter"
//% block.loc.nl="Scheidsrechter"
namespace etarbiter {

    //% block="subscribe player %player"
    //% block.loc.nl="schrijf speler %player in"
    export function subscribe(player: string) {
        if (!ETmatchPlayers[player]) {
            ETplayers.push(player)
            ETmatchPlayers[player] = { points: 0 }
        }
    }

    //% block="a match lasts for %min minutes"
    //% block.loc.nl="een spel duurt %min minuten"
    export function setPlayTime(min: number) {
        ETplayTime = min
    }
}
