var xhr; // TODO : remove
var canvas;
var context; // TODO : remove if safe?
var ctx;

var title = "";
var room = {};
var object = {};
var dialog = {};
var palette = { //start off with a default palette
		"default" : {
			name : "default",
			colors : [[0,0,0],[255,255,255],[255,255,255]]
		}
	};
var ending = {};
var variable = {}; // these are starting variable values -- they don't update (or I don't think they will)
var playerId = "A";

var defaultFontName = "ascii_small";
var fontName = defaultFontName;
var TextDirection = {
	LeftToRight : "LTR",
	RightToLeft : "RTL"
};
var textDirection = TextDirection.LeftToRight;

// TODO : need to redo this for new world of objects
var names = {
	room : new Map(),
	tile : new Map(), // Note: Not currently enabled in the UI
	sprite : new Map(),
	item : new Map(),
	/*dialog : new Map()*/ // TODO
	/*ending : new Map()*/ // TODO
};
function updateNamesFromCurData() {
	names.room = new Map();
	for(id in room) {
		if(room[id].name != undefined && room[id].name != null) {
			names.room.set( room[id].name, id );
		}
	}
	names.tile = new Map();
	for(id in tile) {
		if(tile[id].name != undefined && tile[id].name != null) {
			names.tile.set( tile[id].name, id );
		}
	}
	names.sprite = new Map();
	for(id in sprite) {
		if(sprite[id].name != undefined && sprite[id].name != null) {
			names.sprite.set( sprite[id].name, id );
		}
	}
	names.item = new Map();
	for(id in item) {
		if(item[id].name != undefined && item[id].name != null) {
			names.item.set( item[id].name, id );
		}
	}
}

/* VERSION */
var version = {
	major: 7, // major changes
	minor: 0 // smaller changes
};
function getEngineVersion() {
	return version.major + "." + version.minor;
}

/* FLAGS */
var flags;
function resetFlags() {
	flags = {
		ROOM_FORMAT : 0 // 0 = non-comma separated, 1 = comma separated
	};
}
resetFlags(); //init flags on load script

// SUPER hacky location... :/
var editorDevFlags = {
	// NONE right now!
};

function clearGameData() {
	title = "";
	room = {};
	tile = {};
	sprite = {};
	item = {};
	dialog = {};
	palette = { //start off with a default palette
		"default" : {
			name : "default",
			colors : [[0,0,0],[255,255,255],[255,255,255]]
		}
	};
	ending = {};
	isEnding = false; //todo - correct place for this?
	variable = {};

	// TODO RENDERER : clear data?

	names = {
		room : new Map(),
		tile : new Map(),
		sprite : new Map(),
		item : new Map()
	};

	fontName = defaultFontName; // TODO : reset font manager too?
	textDirection = TextDirection.LeftToRight;
}

var width = 128;
var height = 128;
var scale = 4; //this is stupid but necessary
var tilesize = 8;
var mapsize = 16;

var curRoom = "0";

var key = {
	left : 37,
	right : 39,
	up : 38,
	down : 40,
	space : 32,
	enter : 13,
	w : 87,
	a : 65,
	s : 83,
	d : 68,
	r : 82,
	shift : 16,
	ctrl : 17,
	alt : 18,
	cmd : 224
};

var prevTime = 0;
var deltaTime = 0;

//methods used to trigger gif recording
var didPlayerMoveThisFrame = false;
var onPlayerMoved = null;
// var didDialogUpdateThisFrame = false;
var onDialogUpdate = null;

//inventory update UI handles
var onInventoryChanged = null;
var onVariableChanged = null;
var onGameReset = null;

var isPlayerEmbeddedInEditor = false;

var renderer = new Renderer(tilesize, scale);

function getGameNameFromURL() {
	var game = window.location.hash.substring(1);
	// console.log("game name --- " + game);
	return game;
}

function attachCanvas(c) {
	canvas = c;
	canvas.width = width * scale;
	canvas.height = width * scale;
	ctx = canvas.getContext("2d");
	dialogRenderer.AttachContext(ctx);
	renderer.AttachContext(ctx);
}

var curGameData = null;
function load_game(game_data, startWithTitle) {
	curGameData = game_data; //remember the current game (used to reset the game)

	dialogBuffer.Reset();
	scriptInterpreter.ResetEnvironment(); // ensures variables are reset -- is this the best way?

	parseWorld(game_data);

	if (!isPlayerEmbeddedInEditor) {
		// hack to ensure default font is available
		fontManager.AddResource(defaultFontName + fontManager.GetExtension(), document.getElementById(defaultFontName).text.slice(1));
	}

	var font = fontManager.Get( fontName );
	dialogBuffer.SetFont(font);
	dialogRenderer.SetFont(font);

	setInitialVariables();

	onready(startWithTitle);
}

function reset_cur_game() {
	if (curGameData == null) {
		return; //can't reset if we don't have the game data
	}

	stopGame();
	clearGameData();
	load_game(curGameData);

	if (isPlayerEmbeddedInEditor && onGameReset != null) {
		onGameReset();
	}
}

var update_interval = null;
function onready(startWithTitle) {
	if(startWithTitle === undefined || startWithTitle === null) {
		startWithTitle = true;
	}

	clearInterval(loading_interval);

	input = new InputManager();

	document.addEventListener('keydown', input.onkeydown);
	document.addEventListener('keyup', input.onkeyup);

	if (isPlayerEmbeddedInEditor) {
		canvas.addEventListener('touchstart', input.ontouchstart);
		canvas.addEventListener('touchmove', input.ontouchmove);
		canvas.addEventListener('touchend', input.ontouchend);
	}
	else {
		document.addEventListener('touchstart', input.ontouchstart);
		document.addEventListener('touchmove', input.ontouchmove);
		document.addEventListener('touchend', input.ontouchend);
	}

	window.onblur = input.onblur;

	update_interval = setInterval(update,16);

	if(startWithTitle) { // used by editor 
		startNarrating(title);
	}
}

function setInitialVariables() {
	for(id in variable) {
		var value = variable[id]; // default to string
		if(value === "true") {
			value = true;
		}
		else if(value === "false") {
			value = false;
		}
		else if(!isNaN(parseFloat(value))) {
			value = parseFloat(value);
		}
		scriptInterpreter.SetVariable(id,value);
	}
	scriptInterpreter.SetOnVariableChangeHandler( onVariableChanged );
}

function getOffset(evt) {
	var offset = { x:0, y:0 };

	var el = evt.target;
	var rect = el.getBoundingClientRect();

	offset.x += rect.left + el.scrollLeft;
	offset.y += rect.top + el.scrollTop;

	offset.x = evt.clientX - offset.x;
	offset.y = evt.clientY - offset.y;

	return offset;
}

function stopGame() {
	console.log("stop GAME!");

	document.removeEventListener('keydown', input.onkeydown);
	document.removeEventListener('keyup', input.onkeyup);

	if (isPlayerEmbeddedInEditor) {
		canvas.removeEventListener('touchstart', input.ontouchstart);
		canvas.removeEventListener('touchmove', input.ontouchmove);
		canvas.removeEventListener('touchend', input.ontouchend);
	}
	else {
		document.removeEventListener('touchstart', input.ontouchstart);
		document.removeEventListener('touchmove', input.ontouchmove);
		document.removeEventListener('touchend', input.ontouchend);
	}

	window.onblur = null;

	clearInterval(update_interval);
}

/* loading animation */
var loading_anim_data = [
	[
		0,1,1,1,1,1,1,0,
		0,0,1,1,1,1,0,0,
		0,0,1,1,1,1,0,0,
		0,0,0,1,1,0,0,0,
		0,0,0,1,1,0,0,0,
		0,0,1,0,0,1,0,0,
		0,0,1,0,0,1,0,0,
		0,1,1,1,1,1,1,0,
	],
	[
		0,1,1,1,1,1,1,0,
		0,0,1,0,0,1,0,0,
		0,0,1,1,1,1,0,0,
		0,0,0,1,1,0,0,0,
		0,0,0,1,1,0,0,0,
		0,0,1,0,0,1,0,0,
		0,0,1,1,1,1,0,0,
		0,1,1,1,1,1,1,0,
	],
	[
		0,1,1,1,1,1,1,0,
		0,0,1,0,0,1,0,0,
		0,0,1,0,0,1,0,0,
		0,0,0,1,1,0,0,0,
		0,0,0,1,1,0,0,0,
		0,0,1,1,1,1,0,0,
		0,0,1,1,1,1,0,0,
		0,1,1,1,1,1,1,0,
	],
	[
		0,1,1,1,1,1,1,0,
		0,0,1,0,0,1,0,0,
		0,0,1,0,0,1,0,0,
		0,0,0,1,1,0,0,0,
		0,0,0,1,1,0,0,0,
		0,0,1,1,1,1,0,0,
		0,0,1,1,1,1,0,0,
		0,1,1,1,1,1,1,0,
	],
	[
		0,0,0,0,0,0,0,0,
		1,0,0,0,0,0,0,1,
		1,1,1,0,0,1,1,1,
		1,1,1,1,1,0,0,1,
		1,1,1,1,1,0,0,1,
		1,1,1,0,0,1,1,1,
		1,0,0,0,0,0,0,1,
		0,0,0,0,0,0,0,0,
	]
];
var loading_anim_frame = 0;
var loading_anim_speed = 500;
var loading_interval = null;

function loadingAnimation() {
	//create image
	var loadingAnimImg = ctx.createImageData(8*scale, 8*scale);
	//draw image
	for (var y = 0; y < 8; y++) {
		for (var x = 0; x < 8; x++) {
			var i = (y * 8) + x;
			if (loading_anim_data[loading_anim_frame][i] == 1) {
				//scaling nonsense
				for (var sy = 0; sy < scale; sy++) {
					for (var sx = 0; sx < scale; sx++) {
						var pxl = 4 * ( (((y*scale)+sy) * (8*scale)) + ((x*scale)+sx) );
						loadingAnimImg.data[pxl+0] = 255;
						loadingAnimImg.data[pxl+1] = 255;
						loadingAnimImg.data[pxl+2] = 255;
						loadingAnimImg.data[pxl+3] = 255;
					}
				}
			}
		}
	}
	//put image on canvas
	ctx.putImageData(loadingAnimImg,scale*(width/2 - 4),scale*(height/2 - 4));
	//update frame
	loading_anim_frame++;
	if (loading_anim_frame >= 5) loading_anim_frame = 0;
}

function update() {
	var curTime = Date.now();
	deltaTime = curTime - prevTime;

	if (curRoom == null) {
		// in the special case where there is no valid room, end the game
		startNarrating( "", true /*isEnding*/ );
	}

	if (!transition.IsTransitionActive()) {
		updateInput();
	}

	if (transition.IsTransitionActive()) {
		// transition animation takes over everything!
		transition.UpdateTransition(deltaTime);
	}
	else {
		if (!isNarrating && !isEnding) {
			updateAnimation();
			drawRoom( room[curRoom] ); // draw world if game has begun
		}
		else {
			//make sure to still clear screen
			ctx.fillStyle = "rgb(" + getPal(curPal())[0][0] + "," + getPal(curPal())[0][1] + "," + getPal(curPal())[0][2] + ")";
			ctx.fillRect(0,0,canvas.width,canvas.height);
		}

		// if (isDialogMode) { // dialog mode
		if(dialogBuffer.IsActive()) {
			dialogRenderer.Draw( dialogBuffer, deltaTime );
			dialogBuffer.Update( deltaTime );
		}
		else if (!isEnding) {
			// SUPER HACKY PROTOTYPE update sprite actions
			if (animationCounter == 0) {
				for (id in sprite) {
					if (sprite[id].room === curRoom) {
						for (var i = 0; i < sprite[id].actions.length; i++) {
							// hacky!
							var scriptId = sprite[id].actions[i];
							var scriptStr = dialog[scriptId];
							startDialog(scriptStr,scriptId,sprite[id]);
						}
					}
				}
			}
		}

		// keep moving avatar if player holds down button
		if( !dialogBuffer.IsActive() && !isEnding )
		{
			if( curPlayerDirection != Direction.None ) {
				playerHoldToMoveTimer -= deltaTime;

				if( playerHoldToMoveTimer <= 0 ) {
					movePlayer( curPlayerDirection );
					playerHoldToMoveTimer = 150;
				}
			}
		}
	}

	prevTime = curTime;

	//for gif recording
	if (didPlayerMoveThisFrame && onPlayerMoved != null) {
		onPlayerMoved();
	}
	didPlayerMoveThisFrame = false;

	/* hacky replacement */
	if (onDialogUpdate != null) {
		dialogRenderer.SetPageFinishHandler( onDialogUpdate );
	}

	input.resetKeyPressed();
	input.resetTapReleased();
}

function updateInput() {
	if( dialogBuffer.IsActive() ) {
		if (input.anyKeyPressed() || input.isTapReleased()) {
			/* CONTINUE DIALOG */
			if (dialogBuffer.CanContinue()) {
				var hasMoreDialog = dialogBuffer.Continue();
				if(!hasMoreDialog) {
					// ignore currently held keys UNTIL they are released (stops player from insta-moving)
					input.ignoreHeldKeys();
				}
			}
			else {
				dialogBuffer.Skip();
			}
		}
	}
	else if ( isEnding ) {
		if (input.anyKeyPressed() || input.isTapReleased()) {
			/* RESTART GAME */
			reset_cur_game();
		}
	}
	else {
		/* WALK */
		var prevPlayerDirection = curPlayerDirection;

		if ( input.isKeyDown( key.left ) || input.isKeyDown( key.a ) || input.swipeLeft() ) {
			curPlayerDirection = Direction.Left;
		}
		else if ( input.isKeyDown( key.right ) || input.isKeyDown( key.d ) || input.swipeRight() ) {
			curPlayerDirection = Direction.Right;
		}
		else if ( input.isKeyDown( key.up ) || input.isKeyDown( key.w ) || input.swipeUp() ) {
			curPlayerDirection = Direction.Up;
		}
		else if ( input.isKeyDown( key.down ) || input.isKeyDown( key.s ) || input.swipeDown() ) {
			curPlayerDirection = Direction.Down;
		}
		else {
			curPlayerDirection = Direction.None;
		}

		if (curPlayerDirection != Direction.None && curPlayerDirection != prevPlayerDirection) {
			movePlayer( curPlayerDirection );
			playerHoldToMoveTimer = 500;
		}
	}
}

var animationCounter = 0;
var animationTime = 400;
function updateAnimation() {
	animationCounter += deltaTime;

	if ( animationCounter >= animationTime ) {

		// animate sprites
		for (id in sprite) {
			var spr = sprite[id];
			if (spr.animation.isAnimated) {
				spr.animation.frameIndex = ( spr.animation.frameIndex + 1 ) % spr.animation.frameCount;
			}
		}

		// animate tiles
		for (id in tile) {
			var til = tile[id];
			if (til.animation.isAnimated) {
				til.animation.frameIndex = ( til.animation.frameIndex + 1 ) % til.animation.frameCount;
			}
		}

		// animate items
		for (id in item) {
			var itm = item[id];
			if (itm.animation.isAnimated) {
				itm.animation.frameIndex = ( itm.animation.frameIndex + 1 ) % itm.animation.frameCount;
			}
		}

		// reset counter
		animationCounter = 0;

	}
}

function resetAllAnimations() {
	for (id in sprite) {
		var spr = sprite[id];
		if (spr.animation.isAnimated) {
			spr.animation.frameIndex = 0;
		}
	}

	for (id in tile) {
		var til = tile[id];
		if (til.animation.isAnimated) {
			til.animation.frameIndex = 0;
		}
	}

	for (id in item) {
		var itm = item[id];
		if (itm.animation.isAnimated) {
			itm.animation.frameIndex = 0;
		}
	}
}

function getSpriteAt(x,y) {
	for (var i = 0; i < room[curRoom].objects.length; i++) {
		var objInfo = room[curRoom].objects[i];
		if (object[objInfo.id].type === "SPR") {
			if (objInfo.x == x && objInfo.y == y) {
				return objInfo.id;
			}
		}
	}

	return null;
}

var Direction = {
	None : -1,
	Up : 0,
	Down : 1,
	Left : 2,
	Right : 3
};

var curPlayerDirection = Direction.None;
var playerHoldToMoveTimer = 0;

var InputManager = function() {
	var self = this;

	var pressed;
	var ignored;
	var newKeyPress;
	var touchState;

	function resetAll() {
		pressed = {};
		ignored = {};
		newKeyPress = false;

		touchState = {
			isDown : false,
			startX : 0,
			startY : 0,
			curX : 0,
			curY : 0,
			swipeDistance : 30,
			swipeDirection : Direction.None,
			tapReleased : false
		};
	}
	resetAll();

	function stopWindowScrolling(e) {
		if(e.keyCode == key.left || e.keyCode == key.right || e.keyCode == key.up || e.keyCode == key.down || !isPlayerEmbeddedInEditor)
			e.preventDefault();
	}

	function tryRestartGame(e) {
		/* RESTART GAME */
		if ( e.keyCode === key.r && ( e.getModifierState("Control") || e.getModifierState("Meta") ) ) {
			if ( confirm("Restart the game?") ) {
				reset_cur_game();
			}
		}
	}

	function eventIsModifier(event) {
		return (event.keyCode == key.shift || event.keyCode == key.ctrl || event.keyCode == key.alt || event.keyCode == key.cmd);
	}

	function isModifierKeyDown() {
		return ( self.isKeyDown(key.shift) || self.isKeyDown(key.ctrl) || self.isKeyDown(key.alt) || self.isKeyDown(key.cmd) );
	}

	this.ignoreHeldKeys = function() {
		for (var key in pressed) {
			if (pressed[key]) { // only ignore keys that are actually held
				ignored[key] = true;
				// console.log("IGNORE -- " + key);
			}
		}
	}

	this.onkeydown = function(event) {
		// console.log("KEYDOWN -- " + event.keyCode);

		stopWindowScrolling(event);

		tryRestartGame(event);

		// Special keys being held down can interfere with keyup events and lock movement
		// so just don't collect input when they're held
		{
			if (isModifierKeyDown()) {
				return;
			}

			if (eventIsModifier(event)) {
				resetAll();
			}
		}

		if (ignored[event.keyCode]) {
			return;
		}

		if (!self.isKeyDown(event.keyCode)) {
			newKeyPress = true;
		}

		pressed[event.keyCode] = true;
		ignored[event.keyCode] = false;
	}

	this.onkeyup = function(event) {
		// console.log("KEYUP -- " + event.keyCode);
		pressed[event.keyCode] = false;
		ignored[event.keyCode] = false;
	}

	this.ontouchstart = function(event) {
		event.preventDefault();

		if( event.changedTouches.length > 0 ) {
			touchState.isDown = true;

			touchState.startX = touchState.curX = event.changedTouches[0].clientX;
			touchState.startY = touchState.curY = event.changedTouches[0].clientY;

			touchState.swipeDirection = Direction.None;
		}
	}

	this.ontouchmove = function(event) {
		event.preventDefault();

		if( touchState.isDown && event.changedTouches.length > 0 ) {
			touchState.curX = event.changedTouches[0].clientX;
			touchState.curY = event.changedTouches[0].clientY;

			var prevDirection = touchState.swipeDirection;

			if( touchState.curX - touchState.startX <= -touchState.swipeDistance ) {
				touchState.swipeDirection = Direction.Left;
			}
			else if( touchState.curX - touchState.startX >= touchState.swipeDistance ) {
				touchState.swipeDirection = Direction.Right;
			}
			else if( touchState.curY - touchState.startY <= -touchState.swipeDistance ) {
				touchState.swipeDirection = Direction.Up;
			}
			else if( touchState.curY - touchState.startY >= touchState.swipeDistance ) {
				touchState.swipeDirection = Direction.Down;
			}

			if( touchState.swipeDirection != prevDirection ) {
				// reset center so changing directions is easier
				touchState.startX = touchState.curX;
				touchState.startY = touchState.curY;
			}
		}
	}

	this.ontouchend = function(event) {
		event.preventDefault();

		touchState.isDown = false;

		if( touchState.swipeDirection == Direction.None ) {
			// tap!
			touchState.tapReleased = true;
		}

		touchState.swipeDirection = Direction.None;
	}

	this.isKeyDown = function(keyCode) {
		return pressed[keyCode] != null && pressed[keyCode] == true && (ignored[keyCode] == null || ignored[keyCode] == false);
	}

	this.anyKeyPressed = function() {
		return newKeyPress;
	}

	this.resetKeyPressed = function() {
		newKeyPress = false;
	}

	this.swipeLeft = function() {
		return touchState.swipeDirection == Direction.Left;
	}

	this.swipeRight = function() {
		return touchState.swipeDirection == Direction.Right;
	}

	this.swipeUp = function() {
		return touchState.swipeDirection == Direction.Up;
	}

	this.swipeDown = function() {
		return touchState.swipeDirection == Direction.Down;
	}

	this.isTapReleased = function() {
		return touchState.tapReleased;
	}

	this.resetTapReleased = function() {
		touchState.tapReleased = false;
	}

	this.onblur = function() {
		// console.log("~~~ BLUR ~~");
		resetAll();
	}
}
var input = null;

function movePlayer(direction) {
	if (player().room == null || !Object.keys(room).includes(player().room)) {
		return; // player room is missing or invalid.. can't move them!
	}

	var spr = null;

	if ( curPlayerDirection == Direction.Left && !(spr = getSpriteLeft()) && !isWallLeft()) {
		player().x -= 1;
		didPlayerMoveThisFrame = true;
	}
	else if ( curPlayerDirection == Direction.Right && !(spr = getSpriteRight()) && !isWallRight()) {
		player().x += 1;
		didPlayerMoveThisFrame = true;
	}
	else if ( curPlayerDirection == Direction.Up && !(spr = getSpriteUp()) && !isWallUp()) {
		player().y -= 1;
		didPlayerMoveThisFrame = true;
	}
	else if ( curPlayerDirection == Direction.Down && !(spr = getSpriteDown()) && !isWallDown()) {
		player().y += 1;
		didPlayerMoveThisFrame = true;
	}

	var ext = getExit( player().room, player().x, player().y );
	var end = getEnding( player().room, player().x, player().y );
	var itmIndex = getItemIndex( player().room, player().x, player().y );

	// do items first, because you can pick up an item AND go through a door
	if (itmIndex > -1) {
		// console.log("HIT ITM ");
		// console.log( itmIndex );
		var itm = room[ player().room ].objects[ itmIndex ];
		// console.log(itm);
		room[ player().room ].objects.splice( itmIndex, 1 );
		if( player().inventory[ itm.id ] ) {
			player().inventory[ itm.id ] += 1;
		}
		else {
			player().inventory[ itm.id ] = 1;
		}

		if(onInventoryChanged != null) {
			onInventoryChanged( itm.id );
		}

		startItemDialog( itm.id  /*itemId*/ );

		// console.log( player().inventory );
	}

	if (end) {
		startNarrating( ending[end.id], true /*isEnding*/ );
	}
	else if (ext) {
		movePlayerThroughExit(ext);
	}
	else if (spr) {
		startSpriteDialog( spr /*spriteId*/ );
	}
}

var transition = new TransitionManager();

function movePlayerThroughExit(ext) {
	var GoToDest = function() {
		if (ext.transition_effect != null) {
			transition.BeginTransition(player().room, player().x, player().y, ext.dest.room, ext.dest.x, ext.dest.y, ext.transition_effect);
			transition.UpdateTransition(0);
		}

		player().room = ext.dest.room;
		player().x = ext.dest.x;
		player().y = ext.dest.y;
		curRoom = ext.dest.room;
	};

	// TODO : vNext
	// if(ext.script_id != null && script[ext.script_id]){
	// 	var scriptSourceStr = script[ext.script_id].source;
	// 	startDialog(scriptSourceStr, ext.script_id, function(isExitUnlocked) {
	// 		if (isExitUnlocked == true) {
	// 			GoToDest();
	// 		}
	// 	});
	// }
	// else {
	// 	GoToDest();
	// }

	GoToDest();
}

function getItemIndex(roomId,x,y) {
	for( var i = 0; i < room[roomId].objects.length; i++ ) {
		var objInfo = room[roomId].objects[i];
		if (object[objInfo.id].type === "ITM") {
			if (objInfo.x == x && objInfo.y == y) {
				return i;
			}
		}
	}
	return -1;
}

function getSpriteLeft() { //repetitive?
	return getSpriteAt( player().x - 1, player().y );
}

function getSpriteRight() {
	return getSpriteAt( player().x + 1, player().y );
}

function getSpriteUp() {
	return getSpriteAt( player().x, player().y - 1 );
}

function getSpriteDown() {
	return getSpriteAt( player().x, player().y + 1 );
}

function isWallLeft() {
	return (player().x - 1 < 0) || isWall( player().x - 1, player().y );
}

function isWallRight() {
	return (player().x + 1 >= 16) || isWall( player().x + 1, player().y );
}

function isWallUp() {
	return (player().y - 1 < 0) || isWall( player().x, player().y - 1 );
}

function isWallDown() {
	return (player().y + 1 >= 16) || isWall( player().x, player().y + 1 );
}

function isWall(x,y,roomId) {
	if(roomId == undefined || roomId == null) {
		roomId = curRoom;
	}

	var tileId = getTile(x, y);

	if (tileId === '0') {
		return false; // Blank spaces aren't walls, ya doofus
	}

	if (object[tileId].isWall === undefined || object[tileId].isWall === null) {
		// No wall-state defined: check room-specific walls
		var i = room[roomId].walls.indexOf( getTile(x,y) );
		return i > -1;
	}

	// Otherwise, use the tile's own wall-state
	return object[tileId].isWall;
}

function getItem(roomId,x,y) {
	for (i in room[roomId].items) {
		var item = room[roomId].items[i];
		if (x == item.x && y == item.y) {
			return item;
		}
	}
	return null;
}

function getExit(roomId,x,y) {
	for (i in room[roomId].exits) {
		var e = room[roomId].exits[i];
		if (x == e.x && y == e.y) {
			return e;
		}
	}
	return null;
}

function getEnding(roomId,x,y) {
	for (i in room[roomId].endings) {
		var e = room[roomId].endings[i];
		if (x == e.x && y == e.y) {
			return e;
		}
	}
	return null;
}

function getTile(x,y) {
	// console.log(x + " " + y);
	var t = getRoom().tilemap[y][x];
	return t;
}

function player() {
	return object[playerId];
}

// Sort of a hack for legacy palette code (when it was just an array)
function getPal(id) {
	if (palette[id] === undefined) {
		id = "default";
	}

	return palette[ id ].colors;
}

function getRoom() {
	return room[curRoom];
}

function isSpriteOffstage(id) {
	return sprite[id].room == null;
}

function parseWorld(file) {
	// console.log("~~~ PARSE WORLD ~~~");
	// console.log(file);

	// var parseTimer = new Timer();

	resetFlags();

	var versionNumber = 0;

	var lines = file.split("\n");
	var i = 0;
	while (i < lines.length) {
		var curLine = lines[i];

		// console.log(lines[i]);

		if (i == 0) {
			i = parseTitle(lines, i);
		}
		else if (curLine.length <= 0 || curLine.charAt(0) === "#") {
			// collect version number (from a comment.. hacky I know)
			if (curLine.indexOf("# BITSY VERSION ") != -1) {
				versionNumber = parseFloat(curLine.replace("# BITSY VERSION ", ""));
			}

			//skip blank lines & comments
			i++;
		}
		else if (getType(curLine) == "PAL") {
			i = parsePalette(lines, i);
		}
		else if (getType(curLine) === "ROOM" || getType(curLine) === "SET") { //SET for back compat
			i = parseRoom(lines, i);
		}
		else if (getType(curLine) === "TIL" || getType(curLine) === "SPR" || getType(curLine) === "ITM") {
			i = parseObject(lines, i, getType(curLine), versionNumber);
		}
		else if (getType(curLine) === "DLG") {
			i = parseDialog(lines, i);
		}
		else if (getType(curLine) === "END") {
			i = parseEnding(lines, i);
		}
		// TODO: vNext
		// else if (getType(curLine) === "PRG") {
		// 	i = parseScript(lines, i);
		// }
		else if (getType(curLine) === "VAR") {
			i = parseVariable(lines, i);
		}
		else if (getType(curLine) === "DEFAULT_FONT") {
			i = parseFontName(lines, i);
		}
		else if (getType(curLine) === "TEXT_DIRECTION") {
			i = parseTextDirection(lines, i);
		}
		else if (getType(curLine) === "FONT") {
			i = parseFontData(lines, i);
		}
		else if (getType(curLine) === "!") {
			i = parseFlag(lines, i);
		}
		else {
			i++;
		}
	}

	if (versionNumber < 7) {
		fixupOldObjectIds();
	}

	var roomIds = Object.keys(room);
	if (player() != undefined && player().room != null && roomIds.includes(player().room)) {
		// player has valid room
		curRoom = player().room;
	}
	else if (roomIds.length > 0) {
		// player not in any room! what the heck
		curRoom = roomIds[0];
	}
	else {
		// uh oh there are no rooms I guess???
		curRoom = null;
	}

	console.log("START ROOM " + curRoom);

	renderer.SetPalettes(palette);

	// console.log(names);

	// console.log("~~~~~ PARSE TIME " + parseTimer.Milliseconds());

	return versionNumber;
}

//TODO this is in progress and doesn't support all features
function serializeWorld(skipFonts) {
	if (skipFonts === undefined || skipFonts === null) {
		skipFonts = false;
	}

	var worldStr = "";
	/* TITLE */
	worldStr += title + "\n";
	worldStr += "\n";
	/* VERSION */
	worldStr += "# BITSY VERSION " + getEngineVersion() + "\n"; // add version as a comment for debugging purposes
	worldStr += "\n";
	/* FLAGS */
	for (f in flags) {
		worldStr += "! " + f + " " + flags[f] + "\n";
	}
	worldStr += "\n"
	/* FONT */
	if (fontName != defaultFontName) {
		worldStr += "DEFAULT_FONT " + fontName + "\n";
		worldStr += "\n"
	}
	if (textDirection != TextDirection.LeftToRight) {
		worldStr += "TEXT_DIRECTION " + textDirection + "\n";
		worldStr += "\n"
	}
	/* PALETTE */
	for (id in palette) {
		if (id != "default") {
			worldStr += "PAL " + id + "\n";
			if( palette[id].name != null )
				worldStr += "NAME " + palette[id].name + "\n";
			for (i in getPal(id)) {
				for (j in getPal(id)[i]) {
					worldStr += getPal(id)[i][j];
					if (j < 2) worldStr += ",";
				}
				worldStr += "\n";
			}
			worldStr += "\n";
		}
	}
	/* ROOM */
	for (id in room) {
		worldStr += "ROOM " + id + "\n";
		if ( flags.ROOM_FORMAT == 0 ) {
			// old non-comma separated format
			for (i in room[id].tilemap) {
				for (j in room[id].tilemap[i]) {
					worldStr += room[id].tilemap[i][j];	
				}
				worldStr += "\n";
			}
		}
		else if ( flags.ROOM_FORMAT == 1 ) {
			// new comma separated format
			for (i in room[id].tilemap) {
				for (j in room[id].tilemap[i]) {
					worldStr += room[id].tilemap[i][j];
					if (j < room[id].tilemap[i].length-1) worldStr += ","
				}
				worldStr += "\n";
			}
		}
		if (room[id].name != null) {
			/* NAME */
			worldStr += "NAME " + room[id].name + "\n";
		}
		if (room[id].walls.length > 0) {
			/* WALLS */
			worldStr += "WAL ";
			for (j in room[id].walls) {
				worldStr += room[id].walls[j];
				if (j < room[id].walls.length-1) {
					worldStr += ",";
				}
			}
			worldStr += "\n";
		}
		if (room[id].objects.length > 0) {
			/* OBJECTS */
			for (j in room[id].objects) {
				var obj = room[id].objects[j];
				worldStr += object[obj.id].type + " " + obj.id + " " + obj.x + "," + obj.y;
				worldStr += "\n";
			}
		}
		if (room[id].exits.length > 0) {
			/* EXITS */
			for (j in room[id].exits) {
				var e = room[id].exits[j];
				if ( isExitValid(e) ) {
					worldStr += "EXT " + e.x + "," + e.y + " " + e.dest.room + " " + e.dest.x + "," + e.dest.y;
					if (e.transition_effect != undefined && e.transition_effect != null) {
						worldStr += " FX " + e.transition_effect;
					}
					// TODO : vNext
					// if (e.script_id != undefined && e.script_id != null) {
					// 	worldStr += " PRG " + e.script_id;
					// }
					worldStr += "\n";
				}
			}
		}
		if (room[id].endings.length > 0) {
			/* ENDINGS */
			for (j in room[id].endings) {
				var e = room[id].endings[j];
				// todo isEndingValid
				worldStr += "END " + e.id + " " + e.x + "," + e.y;
				worldStr += "\n";
			}
		}
		if (room[id].pal != null && room[id].pal != "default") {
			/* PALETTE */
			worldStr += "PAL " + room[id].pal + "\n";
		}
		worldStr += "\n";
	}
	/* OBJECTS */
	for (id in object) {
		// TODO : save out if it's the player avatar!

		var type = object[id].type;
		worldStr += type + " " + id + "\n";
		worldStr += serializeDrawing("DRW_" + id);
		if (object[id].name != null && object[id].name != undefined) {
			/* NAME */
			worldStr += "NAME " + object[id].name + "\n";
		}
		if (object[id].col != null && object[id].col != undefined) {
			var defaultColor = type === "TIL" ? 1 : 2;
			if (object[id].col != defaultColor) {
				/* COLOR OVERRIDE */
				worldStr += "COL " + object[id].col + "\n";
			}
		}
		if (type === "TIL" && object[id].isWall != null && object[id].isWall != undefined) {
			/* WALL */
			worldStr += "WAL " + object[id].isWall + "\n";
		}
		if (type != "TIL" && object[id].dlg != null) {
			worldStr += "DLG " + object[id].dlg + "\n";
		}
		if (type != "TIL" && object[id].actions != null && object[id].actions != undefined) {
			for (var i = 0; i < object[id].actions.length; i++) {
				worldStr += "ACT " + object[id].actions[i] + "\n";
			}
		}
		// TODO : implement this ONLY for player avatar!!
		if (type === "SPR" && object[id].isPlayer && object[id].room != null) {
			/* SPRITE POSITION */
			worldStr += "POS " + object[id].room + " " + object[id].x + "," + object[id].y + "\n";
		}
		// TODO : check whether this is the player avatar!!
		if (type === "SPR" && object[id].inventory != null) {
			for(itemId in object[id].inventory) {
				worldStr += "ITM " + itemId + " " + object[id].inventory[itemId] + "\n";
			}
		}

		worldStr += "\n";
	}
	/* DIALOG */
	for (id in dialog) {
		worldStr += "DLG " + id + "\n";
		worldStr += dialog[id] + "\n";
		worldStr += "\n";
	}
	/* ENDINGS */
	for (id in ending) {
		worldStr += "END " + id + "\n";
		worldStr += ending[id] + "\n";
		worldStr += "\n";
	}
	// TODO : vNext
	// /* SCRIPTS */
	// for (id in script) {
	// 	if (script[id].type == ScriptType.Dialogue) {
	// 		worldStr += "DLG " + id + "\n";
	// 	}
	// 	else if (script[id].type == ScriptType.Ending) {
	// 		worldStr += "END " + id + "\n";
	// 	}
	// 	else {
	// 		worldStr += "PRG " + id + "\n";
	// 	}
	// 	worldStr += script[id].source + "\n";
	// 	worldStr += "\n";
	// }
	/* VARIABLES */
	for (id in variable) {
		worldStr += "VAR " + id + "\n";
		worldStr += variable[id] + "\n";
		worldStr += "\n";
	}
	/* FONT */
	// TODO : support multiple fonts
	if (fontName != defaultFontName && !skipFonts) {
		worldStr += fontManager.GetData(fontName);
	}

	return worldStr;
}

function serializeDrawing(drwId) {
	var imageSource = renderer.GetImageSource(drwId);
	var drwStr = "";
	for (f in imageSource) {
		for (y in imageSource[f]) {
			var rowStr = "";
			for (x in imageSource[f][y]) {
				rowStr += imageSource[f][y][x];
			}
			drwStr += rowStr + "\n";
		}
		if (f < (imageSource.length-1)) drwStr += ">\n";
	}
	return drwStr;
}

function isExitValid(e) {
	var hasValidStartPos = e.x >= 0 && e.x < 16 && e.y >= 0 && e.y < 16;
	var hasDest = e.dest != null;
	var hasValidRoomDest = (e.dest.room != null && e.dest.x >= 0 && e.dest.x < 16 && e.dest.y >= 0 && e.dest.y < 16);
	return hasValidStartPos && hasDest && hasValidRoomDest;
}

/* ARGUMENT GETTERS */
function getType(line) {
	return getArg(line,0);
}

function getId(line) {
	return getArg(line,1);
}

function getArg(line,arg) {
	return line.split(" ")[arg];
}

function getCoord(line,arg) {
	return getArg(line,arg).split(",");
}

function parseTitle(lines, i) {
	title = lines[i];
	i++;
	return i;
}

// TODO : store sprite locations
// TODO : find a way to make ROOM_FORMAT 1 (comma separated) the default
// TODO : add a second foreground layer for sprites and items
function parseRoom(lines, i) {
	var id = getId(lines[i]);
	room[id] = {
		id : id,
		tilemap : [],
		walls : [],
		exits : [],
		endings : [],
		objects : [],
		pal : null,
		name : null
	};

	i++;

	// create tile map
	if ( flags.ROOM_FORMAT == 0 ) {
		// old way: no commas, single char tile ids
		var end = i + mapsize;
		var y = 0;
		for (; i<end; i++) {
			room[id].tilemap.push( [] );
			for (x = 0; x<mapsize; x++) {
				room[id].tilemap[y].push( lines[i].charAt(x) );
			}
			y++;
		}
	}
	else if ( flags.ROOM_FORMAT == 1 ) {
		// new way: comma separated, multiple char tile ids
		var end = i + mapsize;
		var y = 0;
		for (; i<end; i++) {
			room[id].tilemap.push( [] );
			var lineSep = lines[i].split(",");
			for (x = 0; x<mapsize; x++) {
				room[id].tilemap[y].push( lineSep[x] );
			}
			y++;
		}
	}

	while (i < lines.length && lines[i].length > 0) { //look for empty line
		// console.log(getType(lines[i]));
		if (getType(lines[i]) === "SPR" || getType(lines[i]) === "ITM") {
			var objId = getId(lines[i]);
			var objCoord = lines[i].split(" ")[2].split(",");
			var obj = {
				id: objId,
				x : parseInt(objCoord[0]),
				y : parseInt(objCoord[1])
			};
			room[id].objects.push(obj);
		}
		else if (getType(lines[i]) === "WAL") {
			// this is deprecated, but I'm not removing it yet
			/* DEFINE COLLISIONS (WALLS) */
			room[id].walls = getId(lines[i]).split(",");
		}
		else if (getType(lines[i]) === "EXT") {
			/* ADD EXIT */
			var exitArgs = lines[i].split(" ");
			//arg format: EXT 10,5 M 3,2 [AVA:7 LCK:a,9] [AVA 7 LCK a 9]
			var exitCoords = exitArgs[1].split(",");
			var destName = exitArgs[2];
			var destCoords = exitArgs[3].split(",");
			var ext = {
				x : parseInt(exitCoords[0]),
				y : parseInt(exitCoords[1]),
				dest : {
					room : destName,
					x : parseInt(destCoords[0]),
					y : parseInt(destCoords[1])
				},
				transition_effect : null,
			};

			// optional arguments
			var exitArgIndex = 4;
			while (exitArgIndex < exitArgs.length) {
				if (exitArgs[exitArgIndex] == "FX") {
					ext.transition_effect = exitArgs[exitArgIndex+1];
					exitArgIndex += 2;
				}
				// TODO : add names here, so it can be referenced from script
				else {
					exitArgIndex += 1;
				}
			}

			room[id].exits.push(ext);
		}
		else if (getType(lines[i]) === "END") {
			// TODO : add optional name arg for scripting purposes
			/* ADD ENDING */
			var endId = getId( lines[i] );
			var endCoords = getCoord( lines[i], 2 );
			var end = {
				id : endId,
				x : parseInt( endCoords[0] ),
				y : parseInt( endCoords[1] )
			};
			room[id].endings.push(end);
		}
		else if (getType(lines[i]) === "PAL") {
			/* CHOOSE PALETTE (that's not default) */
			room[id].pal = getId(lines[i]);
		}
		else if (getType(lines[i]) === "NAME") {
			var name = lines[i].split(/\s(.+)/)[1];
			room[id].name = name;
			names.room.set( name, id);
		}
		i++;
	}

	return i;
}

function parsePalette(lines,i) { //todo this has to go first right now :(
	var id = getId(lines[i]);
	i++;
	var colors = [];
	var name = null;
	while (i < lines.length && lines[i].length > 0) { //look for empty line
		var args = lines[i].split(" ");
		if(args[0] === "NAME") {
			name = lines[i].split(/\s(.+)/)[1];
		}
		else {
			var col = [];
			lines[i].split(",").forEach(function(i) {
				col.push(parseInt(i));
			});
			colors.push(col);
		}
		i++;
	}
	palette[id] = {
		id : id,
		name : name,
		colors : colors
	};
	return i;
}

// TODO : do I need to reset this somewhere?
var backCompatObjectIDs = { SPR : {}, TIL : {}, ITM : {} };
function fixupOldObjectIds() {
	// fixup rooms
	for (var id in room) {
		// replace tile IDs
		var tilemap = room[id].tilemap;
		for (var y = 0; y < mapsize; y++) {
			for (var x = 0; x < mapsize; x++) {
				var oldTileId = room[id].tilemap[y][x];
				if (oldTileId != "0") {
					room[id].tilemap[y][x] = backCompatObjectIDs.TIL[oldTileId];
				}
			}
		}

		// replace item ids
		for (var i = 0; i < room[id].objects.length; i++) {
			var objInfo = room[id].objects[i];
			var type = object[objInfo.id].type;
			if (type === "ITM") {
				objInfo.id = backCompatObjectIDs[type][objInfo.id];
			}
		}
	}

	// TODO : script fixup
}

// TODO : pick up here..
// TODO : need a flag to determine if a sprite is the player
// TODO : handle ID collisions from old versions (or keep the three ID systems???)
function parseObject(lines, i, type, versionNumber) {
	var id = getId(lines[i]);
	i++;

	// need to de-dupe IDs from old versions and store it for later fixup operations (this might get nasty)
	if (versionNumber < 7) {
		var oldId = id;
		// TODO ... instead of doing this gross underscore stuff.. why don't I just keep a count of new objects and assign new IDs that way
		id = id === "A" ? id : type + "_" + oldId;
		backCompatObjectIDs[type][oldId] = id;
	}

	// parse drawing
	var drwId = "DRW_" + id;
	i = parseDrawingCore(lines, i, drwId);

	// TODO .. need to be sure player detection is safe
	var isPlayer = type === "SPR" && id === "A";
	var playerRoom = null;
	var playerX = -1;
	var playerY = -1;

	// default color for tiles is index 1, but for sprites & items it's index 2
	var colorIndex = (type === "TIL" ? 1 : 2);

	// wall property is only used by tiles
	// null indicates it can vary from room to room (original version)
	var isWall = null;

	var name = null;
	var dialogId = null;
	var startingInventory = {};
	var actions = []; // TODO : hack

	// read all other properties
	while (i < lines.length && lines[i].length > 0) { //look for empty line
		if (getType(lines[i]) === "NAME") {
			/* NAME */
			name = lines[i].split(/\s(.+)/)[1];
			names.sprite.set( name, id );
		}
		else if (getType(lines[i]) === "COL") {
			/* COLOR OFFSET INDEX */
			colorIndex = parseInt( getId(lines[i]) );
		}
		else if (getType(lines[i]) === "WAL" && type === "TIL") {
			// only tiles set their initial collision mode
			var wallArg = getArg( lines[i], 1 );
			if( wallArg === "true" ) {
				isWall = true;
			}
			else if( wallArg === "false" ) {
				isWall = false;
			}
		}
		else if(getType(lines[i]) === "DLG" && type != "TIL") {
			// TODO ... consolidate dialog & action code
			dialogId = getId(lines[i]);
		}
		else if (getType(lines[i]) === "ACT" && type != "TIL") {
			// TODO... do I really want to NOT have actions on tiles?
			actions.push(getId(lines[i]));
		}
		else if (getType(lines[i]) === "POS" && type === "SPR") {
			// I still need this to support old single-position data from sprites
			// Also, I suppose this could be useful for the player avatar
			/* STARTING POSITION */
			var posArgs = lines[i].split(" ");
			var roomId = posArgs[1];
			var coordArgs = posArgs[2].split(",");

			if (isPlayer) {
				playerRoom = roomId;
				playerX = parseInt(coordArgs[0]);
				playerY = parseInt(coordArgs[1]);
			}
			else {
				// NOTE: assumes rooms have all been created!
				room[roomId].objects.push({
					id: id,
					x : parseInt(coordArgs[0]),
					y : parseInt(coordArgs[1]),
				});
			}

			// TODO : do I need special handling for player avatar start position?
		}
		else if (getType(lines[i]) === "ITM" && type === "SPR") {
			// This is only used by the player avatar -- should I move it out of sprite data?
			/* ITEM STARTING INVENTORY */
			var itemId = getId(lines[i]);
			var itemCount = parseFloat( getArg(lines[i], 2) );
			startingInventory[itemId] = itemCount;
		}
		i++;
	}

	// object data
	object[id] = {
		id: id, // unique ID
		type: type, // default behavior: is it a sprite, item, or tile?
		name : name, // user-supplied name
		drw: drwId, // drawing ID
		col: colorIndex, // color index
		animation : { // animation data // TODO: figure out how this works with instances
			isAnimated : (renderer.GetFrameCount(drwId) > 1),
			frameIndex : 0,
			frameCount : renderer.GetFrameCount(drwId),
		},
		inventory : startingInventory, // starting inventory (player only)
		dlg : dialogId, // TODO : do I want to consolidate these with the actions?
		actions : actions, // scripts (should tiles execute them? I'm tempted to say no to maintain seperation from foreground)
		isWall : isWall, // wall tile? (tile only)
		// NOTE : starting coordinates are for the player only! other objects don't use this data //TODO : make this less hacky somehow
		isPlayer : isPlayer,
		room : playerRoom,
		x : playerX,
		y : playerY,
	};

	// console.log("PARSE OBJECT " + id);
	// console.log(object[id]);

	return i;
}

function parseDrawingCore(lines, i, drwId) {
	var frameList = []; //init list of frames
	frameList.push( [] ); //init first frame
	var frameIndex = 0;
	var y = 0;
	while ( y < tilesize ) {
		var l = lines[i+y];
		var row = [];
		for (x = 0; x < tilesize; x++) {
			row.push( parseInt( l.charAt(x) ) );
		}
		frameList[frameIndex].push( row );
		y++;

		if (y === tilesize) {
			i = i + y;
			if ( lines[i] != undefined && lines[i].charAt(0) === ">" ) {
				// start next frame!
				frameList.push( [] );
				frameIndex++;
				//start the count over again for the next frame
				i++;
				y = 0;
			}
		}
	}

	renderer.SetImageSource(drwId, frameList);

	return i;
}

// TODO : vNext
// var ScriptType = {
// 	Script : 0,
// 	Dialogue : 1, // TODO : move everything to this spelling?
// 	Ending : 2,
// };

function parseScript(lines, i, objectStore) {
	// TODO : vNext
	// if (scriptType === undefined || scriptType === null) {
	// 	scriptType = ScriptType.Script;
	// }

	var id = getId(lines[i]);
	i++;

	var results = scriptUtils.ReadDialogScript(lines,i);

	// TODO : vNext
	// script[id] = {
	// 	source: results.script,
	// 	type: scriptType,
	// };

	objectStore[id] = results.script;

	i = results.index;

	return i;
}

function parseDialog(lines, i) {
	return parseScript(lines, i, dialog);
}

function parseEnding(lines, i) {
	return parseScript(lines, i, ending);
}

function parseVariable(lines, i) {
	var id = getId(lines[i]);
	i++;
	var value = lines[i];
	i++;
	variable[id] = value;
	return i;
}

function parseFontName(lines, i) {
	fontName = getArg(lines[i], 1);
	i++;
	return i;
}

function parseTextDirection(lines, i) {
	textDirection = getArg(lines[i], 1);
	i++;
	return i;
}

function parseFontData(lines, i) {
	// NOTE : we're not doing the actual parsing here --
	// just grabbing the block of text that represents the font
	// and giving it to the font manager to use later

	var localFontName = getId(lines[i]);
	var localFontData = lines[i];
	i++;

	while (i < lines.length && lines[i] != "") {
		localFontData += "\n" + lines[i];
		i++;
	}

	var localFontFilename = localFontName + fontManager.GetExtension();
	fontManager.AddResource( localFontFilename, localFontData );

	return i;
}

function parseFlag(lines, i) {
	var id = getId(lines[i]);
	var valStr = lines[i].split(" ")[2];
	flags[id] = parseInt( valStr );
	i++;
	return i;
}

function drawObject(img,x,y,context) {
	if (!context) { //optional pass in context; otherwise, use default
		context = ctx;
	}
	// NOTE: images are now canvases, instead of raw image data (for chrome performance reasons)
	context.drawImage(img,x*tilesize*scale,y*tilesize*scale,tilesize*scale,tilesize*scale);
}

// var debugLastRoomDrawn = "0";

function drawRoom(room,context,frameIndex) { // context & frameIndex are optional
	if (!context) { //optional pass in context; otherwise, use default (ok this is REAL hacky isn't it)
		context = ctx;
	}

	// if (room.id != debugLastRoomDrawn) {
	// 	debugLastRoomDrawn = room.id;
	// 	console.log("DRAW ROOM " + debugLastRoomDrawn);
	// }

	var paletteId = "default";

	if (room === undefined) {
		// protect against invalid rooms
		context.fillStyle = "rgb(" + getPal(paletteId)[0][0] + "," + getPal(paletteId)[0][1] + "," + getPal(paletteId)[0][2] + ")";
		context.fillRect(0,0,canvas.width,canvas.height);
		return;
	}

	//clear screen
	if (room.pal != null && palette[paletteId] != undefined) {
		paletteId = room.pal;
	}
	context.fillStyle = "rgb(" + getPal(paletteId)[0][0] + "," + getPal(paletteId)[0][1] + "," + getPal(paletteId)[0][2] + ")";
	context.fillRect(0,0,canvas.width,canvas.height);

	//draw tiles
	for (i in room.tilemap) {
		for (j in room.tilemap[i]) {
			var id = room.tilemap[i][j];
			if (id != "0") {
				//console.log(id);
				if (object[id] == null) { // hack-around to avoid corrupting files (not a solution though!)
					id = "0";
					room.tilemap[i][j] = id;
				}
				else {
					// console.log(id);
					drawObject( renderer.GetImage(object[id],paletteId,frameIndex), j, i, context );
				}
			}
		}
	}

	// TODO : need to think about object instances..
	//draw objects
	for (var i = 0; i < room.objects.length; i++) {
		var objInfo = room.objects[i];
		drawObject(renderer.GetImage(object[objInfo.id],paletteId,frameIndex), objInfo.x, objInfo.y, context);
	}

	//draw player
	if (player().room === room.id) {
		drawObject(renderer.GetImage(player(),paletteId,frameIndex), player().x, player().y, context)
	}
}

function curPal() {
	return getRoomPal(curRoom);
}

function getRoomPal(roomId) {
	var defaultId = "default";

	if (roomId == null) {
		return defaultId;
	}
	else if (room[roomId].pal != null) {
		//a specific palette was chosen
		return room[roomId].pal;
	}
	else {
		if (roomId in palette) {
			//there is a palette matching the name of the room
			return roomId;
		}
		else {
			//use the default palette
			return defaultId;
		}
	}
	return defaultId;
}

var isDialogMode = false;
var isNarrating = false;
var isEnding = false;
var dialogModule = new Dialog();
var dialogRenderer = dialogModule.CreateRenderer();
var dialogBuffer = dialogModule.CreateBuffer();
var fontManager = new FontManager();

function onExitDialog(scriptResult, dialogCallback) {
	isDialogMode = false;
	if (isNarrating) isNarrating = false;
	if (isDialogPreview) {
		isDialogPreview = false;
		if (onDialogPreviewEnd != null)
			onDialogPreviewEnd();
	}

	if (dialogCallback != undefined && dialogCallback != null) {
		dialogCallback(scriptResult);
	}
}

/*
TODO
- titles and endings should also take advantage of the script pre-compilation if possible??
- could there be a namespace collision?
- what about dialog NAMEs vs IDs?
- what about a special script block separate from DLG?
*/
function startNarrating(dialogStr,end) {
	console.log("NARRATE " + dialogStr);

	if (end === undefined) {
		end = false;
	}

	isNarrating = true;
	isEnding = end;
	startDialog(dialogStr);
}


// TODO : these two methods are now basically redundant!!
function startItemDialog(itemId) {
	var itm = object[itemId];
	var dialogId = itm.dlg;
	// console.log("START ITEM DIALOG " + dialogId);
	if(dialog[dialogId]){
		var dialogStr = dialog[dialogId];
		startDialog(dialogStr,dialogId);
	}
}

function startSpriteDialog(spriteId) {
	var spr = object[spriteId];
	// TODO ... need to remove the old automatic dialog id stuff
	var dialogId = spr.dlg ? spr.dlg : spriteId;
	// console.log("START SPRITE DIALOG " + dialogId);
	if(dialog[dialogId]){
		var dialogStr = dialog[dialogId];
		startDialog(dialogStr,dialogId,spr);
	}
}

function startDialog(dialogStr,scriptId,object) {
	// console.log("START DIALOG ");
	if(dialogStr.length <= 0) {
		// console.log("ON EXIT DIALOG -- startDialog 1");
		onExitDialog();
		return;
	}

	isDialogMode = true;

	dialogRenderer.Reset();
	dialogRenderer.SetCentered( isNarrating /*centered*/ );
	dialogBuffer.Reset();
	scriptInterpreter.SetDialogBuffer( dialogBuffer );

	var onScriptEnd = function(scriptResult) {
		dialogBuffer.OnDialogEnd(function() {
			onExitDialog(scriptResult);
		});
	};

	if(scriptId === undefined) {
		scriptInterpreter.Interpret( dialogStr, onScriptEnd, object );
	}
	else {
		if(!scriptInterpreter.HasScript(scriptId)) {
			scriptInterpreter.Compile( scriptId, dialogStr );
		}
		scriptInterpreter.DebugVisualizeScriptTree(scriptId);
		scriptInterpreter.Run( scriptId, onScriptEnd, object );
	}

}

var isDialogPreview = false;
function startPreviewDialog(script, onScriptEnd) {
	isNarrating = true;

	isDialogMode = true;

	isDialogPreview = true;

	dialogRenderer.Reset();
	dialogRenderer.SetCentered( true );
	dialogBuffer.Reset();
	scriptInterpreter.SetDialogBuffer( dialogBuffer );

	onDialogPreviewEnd = onScriptEnd;

	scriptInterpreter.Eval( script, null );
}

/* NEW SCRIPT STUFF */
var scriptModule = new Script();
var scriptInterpreter = scriptModule.CreateInterpreter();
var scriptUtils = scriptModule.CreateUtils(); // TODO: move to editor.js?
// scriptInterpreter.SetDialogBuffer( dialogBuffer );