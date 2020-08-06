function Dialog() {

this.CreateRenderer = function() {
	return new DialogRenderer();
};

this.CreateBuffer = function() {
	return new DialogBuffer();
};

var DialogRenderer = function() {

	// TODO : refactor this eventually? remove everything from struct.. avoid the defaults?
	var textboxInfo = {
		img : null,
		width : 104,
		height : 8+4+2+5, //8 for text, 4 for top-bottom padding, 2 for line padding, 5 for arrow
		top : 12,
		left : 12,
		bottom : 12, //for drawing it from the bottom
		font_scale : 0.5, // we draw font at half-size compared to everything else
		padding_vert : 2,
		padding_horz : 4,
		arrow_height : 5,
	};

	var font = null;
	this.SetFont = function(f) {
		font = f;
		textboxInfo.height = (textboxInfo.padding_vert * 3) + (relativeFontHeight() * 2) + textboxInfo.arrow_height;
		textboxInfo.img = context.createImageData(textboxInfo.width*scale, textboxInfo.height*scale);
	}

	function textScale() {
		return scale * textboxInfo.font_scale;
	}

	function relativeFontWidth() {
		return Math.ceil( font.getWidth() * textboxInfo.font_scale );
	}

	function relativeFontHeight() {
		return Math.ceil( font.getHeight() * textboxInfo.font_scale );
	}

	var context = null;
	this.AttachContext = function(c) {
		context = c;
	};

	this.ClearTextbox = function() {
		if(context == null) return;

		//create new image none exists
		if(textboxInfo.img == null)
			textboxInfo.img = context.createImageData(textboxInfo.width*scale, textboxInfo.height*scale);

		// fill text box with black
		for (var i=0;i<textboxInfo.img.data.length;i+=4)
		{
			textboxInfo.img.data[i+0]=0;
			textboxInfo.img.data[i+1]=0;
			textboxInfo.img.data[i+2]=0;
			textboxInfo.img.data[i+3]=255;
		}
	};

	var isCentered = false;
	this.SetCentered = function(centered) {
		isCentered = centered;
	};

	this.DrawTextbox = function() {
		if(context == null) return;
		if (isCentered) {
			context.putImageData(textboxInfo.img, textboxInfo.left*scale, ((height/2)-(textboxInfo.height/2))*scale);
		}
		else if (player().y < mapsize/2) {
			//bottom
			context.putImageData(textboxInfo.img, textboxInfo.left*scale, (height-textboxInfo.bottom-textboxInfo.height)*scale);
		}
		else {
			//top
			context.putImageData(textboxInfo.img, textboxInfo.left*scale, textboxInfo.top*scale);
		}
	};

	var arrowdata = [
		1,1,1,1,1,
		0,1,1,1,0,
		0,0,1,0,0
	];
	this.DrawNextArrow = function() {
		// console.log("draw arrow!");
		var top = (textboxInfo.height-5) * scale;
		var left = (textboxInfo.width-(5+4)) * scale;
		if (textDirection === TextDirection.RightToLeft) { // RTL hack
			left = 4 * scale;
		}

		for (var y = 0; y < 3; y++) {
			for (var x = 0; x < 5; x++) {
				var i = (y * 5) + x;
				if (arrowdata[i] == 1) {
					//scaling nonsense
					for (var sy = 0; sy < scale; sy++) {
						for (var sx = 0; sx < scale; sx++) {
							var pxl = 4 * ( ((top+(y*scale)+sy) * (textboxInfo.width*scale)) + (left+(x*scale)+sx) );
							textboxInfo.img.data[pxl+0] = 255;
							textboxInfo.img.data[pxl+1] = 255;
							textboxInfo.img.data[pxl+2] = 255;
							textboxInfo.img.data[pxl+3] = 255;
						}
					}
				}
			}
		}
	};

	var text_scale = 2; //using a different scaling factor for text feels like cheating... but it looks better
	this.DrawChar = function(char, row, col, leftPos) {
		char.offset = {
			x: char.base_offset.x,
			y: char.base_offset.y
		}; // compute render offset *every* frame

		char.SetPosition(row,col);
		char.ApplyEffects(effectTime);

		var charData = char.bitmap;

		var top = (4 * scale) + (row * 2 * scale) + (row * font.getHeight() * text_scale) + Math.floor( char.offset.y );
		var left = (4 * scale) + (leftPos * text_scale) + Math.floor( char.offset.x );

		var debug_r = Math.random() * 255;

		for (var y = 0; y < char.height; y++) {
			for (var x = 0; x < char.width; x++) {

				var i = (y * char.width) + x;
				if ( charData[i] == 1 ) {

					//scaling nonsense
					for (var sy = 0; sy < text_scale; sy++) {
						for (var sx = 0; sx < text_scale; sx++) {
							var pxl = 4 * ( ((top+(y*text_scale)+sy) * (textboxInfo.width*scale)) + (left+(x*text_scale)+sx) );
							textboxInfo.img.data[pxl+0] = char.color.r;
							textboxInfo.img.data[pxl+1] = char.color.g;
							textboxInfo.img.data[pxl+2] = char.color.b;
							textboxInfo.img.data[pxl+3] = char.color.a;
						}
					}
				}

			}
		}
	};

	var effectTime = 0; // TODO this variable should live somewhere better
	this.Draw = function(buffer, dt) {
		effectTime += dt;

		this.ClearTextbox();

		buffer.ForEachActiveChar(this.DrawChar);

		if (buffer.CanContinue()) {
			this.DrawNextArrow();
		}

		this.DrawTextbox();
	};

	this.Reset = function() {
		effectTime = 0;
		// TODO - anything else?
	}

	// this.CharsPerRow = function() {
	// 	return textboxInfo.charsPerRow;
	// }
}


var DialogBuffer = function() {
	var buffer = []; // holds dialog in an array buffer

	var pageIndex = 0;
	var rowIndex = 0;
	var charIndex = 0;

	var nextCharTimer = 0;
	var nextCharMaxTime = 50; // in milliseconds

	var activeTextEffects = [];

	var font = null;
	var arabicHandler = new ArabicHandler();

	var onDialogEndCallbacks = [];

	// TODO : these seem like good reasons to combine the buffer and the renderer
	var maxRowCount = 2;
	var pixelsPerRow = 192; // hard-coded fun times!!!

	function AddPage() {
		var page = {
			rows : [],
			isFinished : false,
			postPageScriptHandlers : [],
		};

		buffer.push(page);

		AddRow();
	}

	function AddRow() {
		var row = {
			chars : [],
			isFinished : false,
		};

		LastPage().rows.push(row);
	}

	this.SetFont = function(f) {
		font = f;
	}

	function CurPage() {
		return buffer[pageIndex];
	};

	function CurRow() {
		return CurPage().rows[rowIndex];
	};

	function CurChar() {
		if (CurRow() == null) {
			return null;
		}

		return CurRow().chars[charIndex];
	}

	function CurPageCount() {
		return buffer.length;
	};

	function CurRowCount() {
		return CurPage().rows.length;
	}

	function CurCharCount() {
		if (CurRow() == null) {
			return -1;
		}

		return CurRow().chars.length;
	}

	function LastPage() {
		return buffer[buffer.length - 1];
	}

	function LastRow() {
		var rows = LastPage().rows;
		return rows[rows.length - 1];
	}

	// Iterates over visible characters on the active page
	this.ForEachActiveChar = function(handler) {
		var rowArray = CurPage().rows;

		for (var i = 0; i < rowArray.length; i++) {
			var row = rowArray[i];

			var charCount = (i == rowIndex) ? (charIndex + 1) : row.chars.length;

			var leftPos = 0;
			if (textDirection === TextDirection.RightToLeft) {
				leftPos = 24 * 8; // hack -- I think this is correct?
			}

			for (var j = 0; j < charCount; j++) {
				var char = row.chars[j];
				if (char) {
					if (textDirection === TextDirection.RightToLeft) {
						leftPos -= char.spacing;
					}

					handler(char, i, /*rowIndex*/ j, /*colIndex*/ leftPos);

					if (textDirection === TextDirection.LeftToRight) {
						leftPos += char.spacing;
					}
				}
			}
		}
	}

	this.Reset = function() {
		buffer = [];
		pageIndex = 0;
		rowIndex = 0;
		charIndex = 0;
		activeTextEffects = [];
		onDialogEndCallbacks = [];
	};

	function DoNextChar() {
		nextCharTimer = 0; // reset timer

		// first, if this is an inline script control char,
		// make sure to execute the next part of the script
		if (CurChar() != null && CurChar().isScriptControlChar) {
			CurChar().ContinueScriptExecution();
			nextCharTimer = nextCharMaxTime; // forces us to continue immediately to next char
		}

		// then update the current character location
		if (charIndex < CurCharCount()) {
			//add char to current row
			charIndex++;
		}
		else if (rowIndex < CurRowCount()) {
			//start next row
			rowIndex++;
			charIndex = 0;
		}
	};

	this.Update = function(dt) {
		nextCharTimer += dt; // tick timer

		while (nextCharTimer >= nextCharMaxTime && !this.CanContinue()) {
			DoNextChar();
		}
	};

	this.Skip = function() {
		// add new characters until you get to the end of the current line of dialog
		while (rowIndex < CurRowCount()) {
			DoNextChar();

			if (this.CanContinue()) {
				//make sure to push the rowIndex past the end to break out of the loop
				rowIndex++;
				charIndex = 0;
			}
		}

		rowIndex = CurRowCount()-1;
		charIndex = CurCharCount()-1;
	};

	this.Continue = function() {
		// todo... should these use callbacks? is it really possible to have more than one?
		for (var i = 0; i < CurPage().postPageScriptHandlers.length; i++) {
			CurPage().postPageScriptHandlers[i].ContinueScriptExecution();
		}

		pageIndex++;

		if (pageIndex < CurPageCount()) {
			// flip page!
			rowIndex = 0;
			charIndex = 0;
			nextCharTimer = 0;
		}
		else {
			// end of dialog
			for (var i = 0; i < onDialogEndCallbacks.length; i++) {
				onDialogEndCallbacks[i]();
			}
		}

		return IsActive(); // hasMoreDialog
	};

	function IsActive() {
		return pageIndex < CurPageCount();
	}
	this.IsActive = IsActive;

	this.OnDialogEnd = function(callback) {
		if (!IsActive()) {
			callback();
		}
		else {
			onDialogEndCallbacks.push(callback);
		}
	}

	this.CanContinue = function() {
		return charIndex >= CurCharCount() && rowIndex >= CurRowCount();
	};

	function DialogChar(effectList) {
		this.effectList = effectList.slice(); // clone effect list (since it can change between chars)

		this.color = { r:255, g:255, b:255, a:255 };
		this.offset = { x:0, y:0 }; // in pixels (screen pixels?)

		this.col = 0;
		this.row = 0;

		this.SetPosition = function(row,col) {
			// console.log("SET POS");
			// console.log(this);
			this.row = row;
			this.col = col;
		}

		this.ApplyEffects = function(time) {
			// console.log("APPLY EFFECTS! " + time);
			for(var i = 0; i < this.effectList.length; i++) {
				var effectName = this.effectList[i].name;
				// console.log("FX " + effectName);
				TextEffects[effectName].DoEffect(this, time, this.effectList[i].parameters);
			}
		}

		this.bitmap = [];
		this.width = 0;
		this.height = 0;
		this.base_offset = { // hacky name
 			x: 0,
			y: 0
		};
		this.spacing = 0;
	}

	function DialogFontChar(font, char, effectList) {
		Object.assign(this, new DialogChar(effectList));

		var charData = font.getChar(char);
		this.bitmap = charData.data;
		this.width = charData.width;
		this.height = charData.height;
		this.base_offset.x = charData.offset.x;
		this.base_offset.y = charData.offset.y;
		this.spacing = charData.spacing;
	}

	function DialogDrawingChar(drawingId, effectList) {
		Object.assign(this, new DialogChar(effectList));

		var imageData = renderer.GetImageSource(drawingId)[0];
		var imageDataFlat = [];
		for (var i = 0; i < imageData.length; i++) {
			// console.log(imageData[i]);
			imageDataFlat = imageDataFlat.concat(imageData[i]);
		}

		this.bitmap = imageDataFlat;
		this.width = 8;
		this.height = 8;
		this.spacing = 8;
	}

	function DialogScriptControlChar() {
		Object.assign(this, new DialogChar([]));

		this.width = 0;
		this.height = 0;
		this.spacing = 0;

		this.isScriptControlChar = true;

		var handlerFunc = null;

		this.SetHandler = function(handler) {
			handlerFunc = handler;
		}

		this.ContinueScriptExecution = function() {
			if (handlerFunc != null) {
				handlerFunc();
			}
		}
	}

	function CreateCharArray(word, effectList) {
		var charArray = [];

		for (var i = 0; i < word.length; i++) {
			charArray.push(new DialogFontChar(font, word[i], effectList));
		}

		return charArray;
	}

	function GetCharArrayWidth(charArray) {
		var width = 0;
		for(var i = 0; i < charArray.length; i++) {
			width += charArray[i].spacing;
		}
		return width;
	}

	function GetStringWidth(str) {
		var width = 0;
		for (var i = 0; i < str.length; i++) {
			var charData = font.getChar(str[i]);
			width += charData.spacing;
		}
		return width;
	}

	this.AddScriptReturn = function(onReturnHandler) {
		var controlChar = new DialogScriptControlChar();
		controlChar.SetHandler(function() {
			console.log("RETURN TO SCRIPT EXECUTION!");
			onReturnHandler();
		});

		if (IsActive() && LastPage().isFinished) {
			console.log("ADD SCRIPT RETURN -- post page");
			// add script return after page ends
			LastPage().postPageScriptHandlers.push(controlChar);
		}
		else if (IsActive()) {
			console.log("ADD SCRIPT RETURN -- inline");
			console.log(LastPage());
			// add inline script return
			LastRow().chars.push(controlChar);
		}
		else {
			// TODO
			console.log("OH NO NOTHING IS ACTIVE!!!");
		}
	}

	function AddWordCharArray(wordCharArray, prependSpaceChar) {
		if (prependSpaceChar === undefined || prependSpaceChar === null) {
			prependSpaceChar = false;
		}

		var spaceCharArray = CreateCharArray(" ", activeTextEffects);

		// figure out if the word fits on the current row
		var wordLength = prependSpaceChar ?
			GetCharArrayWidth(spaceCharArray.concat(wordCharArray)) : GetCharArrayWidth(wordCharArray);
		var rowLength = IsActive() ? GetCharArrayWidth(LastRow().chars) : 0;
		var doesWordFitOnRow = rowLength + wordLength <= pixelsPerRow || rowLength <= 0;

		// mark whether the current row and/or page will now be finished
		if (IsActive()) {
			LastRow().isFinished = LastRow().isFinished || !doesWordFitOnRow;

			var finalRowFinished = (LastRow().isFinished && LastPage().rows.length + 1 > maxRowCount);
			LastPage().isFinished = LastPage().isFinished || finalRowFinished;
		}

		// do we need to start a new page or row?
		var isNewLine = !IsActive() || LastRow().isFinished;
		var isNewPage = !IsActive() || LastPage().isFinished;

		// add the word
		if (isNewPage) {
			//start next page
			AddPage();
			LastRow().chars = LastRow().chars.concat(wordCharArray);
		}
		else if (isNewLine) {
			//start next row
			AddRow();
			LastRow().chars = LastRow().chars.concat(wordCharArray);
		}
		else {
			//stay on same row
			wordCharArray = prependSpaceChar ? spaceCharArray.concat(wordCharArray) : wordCharArray;
			LastRow().chars = LastRow().chars.concat(wordCharArray);
		}
	}

	this.AddDrawing = function(drawingId) {
		var drawingChar = new DialogDrawingChar(drawingId, activeTextEffects);
		AddWordCharArray([drawingChar]);
	}

	this.AddText = function(textStr) {
		console.log("ADD TEXT " + textStr);

		// add text to page buffer, one word at a time
		var words = textStr.split(" ");

		for (var i = 0; i < words.length; i++) {
			var word = words[i];
			if (arabicHandler.ContainsArabicCharacters(word)) {
				word = arabicHandler.ShapeArabicCharacters(word);
			}

			var wordCharArray = CreateCharArray(word, activeTextEffects);
			var prependSpaceChar = i != 0;

			AddWordCharArray(wordCharArray, prependSpaceChar);
		}
	};

	// todo... share stuff with AddText?
	this.AddWord = function(wordStr) {
		if (arabicHandler.ContainsArabicCharacters(wordStr)) {
			wordStr = arabicHandler.ShapeArabicCharacters(wordStr);
		}

		var wordCharArray = CreateCharArray(wordStr, activeTextEffects);

		AddWordCharArray(wordCharArray, true);		
	}

	this.AddLinebreak = function() {
		// TODO : decide if this is the right behavior
		// // Ensure there is a row to mark as finished
		if (!IsActive() || LastPage().rows.length + 1 > maxRowCount) {
			// todo : mark last page finished
			AddPage();
		}
		else if (IsActive() && LastRow().isFinished) {
			AddRow();
		}
		else if (IsActive()) {
			LastRow().isFinished = true;
		}
	}

	this.AddPagebreak = function() {
		// TODO : decide if this is the right behavior
		// Ensure there is a page to mark as finished
		if (!IsActive() || LastPage().isFinished) {
			AddPage();
		}
		else if (IsActive()) {
			LastPage().isFinished = true;
		}
	}

	/* new text effects */
	this.HasTextEffect = function(name) {
		var findFirstWithName = function (effect) {
			return effect.name === name;
		};

		return activeTextEffects.findIndex(findFirstWithName) > -1;
	}

	this.AddTextEffect = function(name, parameters) {
		activeTextEffects.push({
			name: name,
			parameters: parameters,
		});
	}

	this.RemoveTextEffect = function(name) {
		var findFirstWithName = function (effect) {
			return effect.name === name;
		};

		var index = activeTextEffects.slice().reverse().findIndex(findFirstWithName);

		if (index > -1) {
			index = (activeTextEffects.length - 1) - index;
			activeTextEffects.splice(index, 1);
		}
	}
};

/* ARABIC */
var ArabicHandler = function() {

	var arabicCharStart = 0x0621;
	var arabicCharEnd = 0x064E;

	var CharacterForm = {
		Isolated : 0,
		Final : 1,
		Initial : 2,
		Middle : 3
	};

	// map glyphs to their character forms
	var glyphForms = {
		/*		 Isolated, Final, Initial, Middle Forms	*/
		0x0621: [0xFE80,0xFE80,0xFE80,0xFE80], /*  HAMZA  */ 
		0x0622: [0xFE81,0xFE82,0xFE81,0xFE82], /*  ALEF WITH MADDA ABOVE  */ 
		0x0623: [0xFE83,0xFE84,0xFE83,0xFE84], /*  ALEF WITH HAMZA ABOVE  */ 
		0x0624: [0xFE85,0xFE86,0xFE85,0xFE86], /*  WAW WITH HAMZA ABOVE  */ 
		0x0625: [0xFE87,0xFE88,0xFE87,0xFE88], /*  ALEF WITH HAMZA BELOW  */ 
		0x0626: [0xFE89,0xFE8A,0xFE8B,0xFE8C], /*  YEH WITH HAMZA ABOVE  */ 
		0x0627: [0xFE8D,0xFE8E,0xFE8D,0xFE8E], /*  ALEF  */ 
		0x0628: [0xFE8F,0xFE90,0xFE91,0xFE92], /*  BEH  */ 
		0x0629: [0xFE93,0xFE94,0xFE93,0xFE94], /*  TEH MARBUTA  */ 
		0x062A: [0xFE95,0xFE96,0xFE97,0xFE98], /*  TEH  */ 
		0x062B: [0xFE99,0xFE9A,0xFE9B,0xFE9C], /*  THEH  */ 
		0x062C: [0xFE9D,0xFE9E,0xFE9F,0xFEA0], /*  JEEM  */ 
		0x062D: [0xFEA1,0xFEA2,0xFEA3,0xFEA4], /*  HAH  */ 
		0x062E: [0xFEA5,0xFEA6,0xFEA7,0xFEA8], /*  KHAH  */ 
		0x062F: [0xFEA9,0xFEAA,0xFEA9,0xFEAA], /*  DAL  */ 
		0x0630: [0xFEAB,0xFEAC,0xFEAB,0xFEAC], /*  THAL */ 
		0x0631: [0xFEAD,0xFEAE,0xFEAD,0xFEAE], /*  RAA  */ 
		0x0632: [0xFEAF,0xFEB0,0xFEAF,0xFEB0], /*  ZAIN  */ 
		0x0633: [0xFEB1,0xFEB2,0xFEB3,0xFEB4], /*  SEEN  */ 
		0x0634: [0xFEB5,0xFEB6,0xFEB7,0xFEB8], /*  SHEEN  */ 
		0x0635: [0xFEB9,0xFEBA,0xFEBB,0xFEBC], /*  SAD  */ 
		0x0636: [0xFEBD,0xFEBE,0xFEBF,0xFEC0], /*  DAD  */ 
		0x0637: [0xFEC1,0xFEC2,0xFEC3,0xFEC4], /*  TAH  */ 
		0x0638: [0xFEC5,0xFEC6,0xFEC7,0xFEC8], /*  ZAH  */ 
		0x0639: [0xFEC9,0xFECA,0xFECB,0xFECC], /*  AIN  */ 
		0x063A: [0xFECD,0xFECE,0xFECF,0xFED0], /*  GHAIN  */ 
		0x063B: [0x0000,0x0000,0x0000,0x0000], /*  space */
		0x063C: [0x0000,0x0000,0x0000,0x0000], /*  space */
		0x063D: [0x0000,0x0000,0x0000,0x0000], /*  space */
		0x063E: [0x0000,0x0000,0x0000,0x0000], /*  space */
		0x063F: [0x0000,0x0000,0x0000,0x0000], /*  space */
		0x0640: [0x0640,0x0640,0x0640,0x0640], /*  TATWEEL  */ 
		0x0641: [0xFED1,0xFED2,0xFED3,0xFED4], /*  FAA  */ 
		0x0642: [0xFED5,0xFED6,0xFED7,0xFED8], /*  QAF  */ 
		0x0643: [0xFED9,0xFEDA,0xFEDB,0xFEDC], /*  KAF  */ 
		0x0644: [0xFEDD,0xFEDE,0xFEDF,0xFEE0], /*  LAM  */ 
		0x0645: [0xFEE1,0xFEE2,0xFEE3,0xFEE4], /*  MEEM  */ 
		0x0646: [0xFEE5,0xFEE6,0xFEE7,0xFEE8], /*  NOON  */ 
		0x0647: [0xFEE9,0xFEEA,0xFEEB,0xFEEC], /*  HEH  */ 
		0x0648: [0xFEED,0xFEEE,0xFEED,0xFEEE], /*  WAW  */ 
		0x0649: [0xFEEF,0xFEF0,0xFBE8,0xFBE9], /*  ALEF MAKSURA  */ 
		0x064A: [0xFEF1,0xFEF2,0xFEF3,0xFEF4], /*  YEH  */ 
		0x064B: [0xFEF5,0xFEF6,0xFEF5,0xFEF6], /*  LAM ALEF MADD*/
		0x064C: [0xFEF7,0xFEF8,0xFEF7,0xFEF8], /*  LAM ALEF HAMZA ABOVE*/
		0x064D: [0xFEF9,0xFEFa,0xFEF9,0xFEFa], /*  LAM ALEF HAMZA BELOW*/
		0x064E: [0xFEFb,0xFEFc,0xFEFb,0xFEFc], /*  LAM ALEF */
	};

	var disconnectedCharacters = [0x0621,0x0622,0x0623,0x0624,0x0625,0x0627,0x062f,0x0630,0x0631,0x0632,0x0648,0x0649,0x064b,0x064c,0x064d,0x064e];

	function IsArabicCharacter(char) {
		var code = char.charCodeAt(0);
		return (code >= arabicCharStart && code <= arabicCharEnd);
	}

	function ContainsArabicCharacters(word) {
		for (var i = 0; i < word.length; i++) {
			if (IsArabicCharacter(word[i])) {
				return true;
			}
		}
		return false;
	}

	function IsDisconnectedCharacter(char) {
		var code = char.charCodeAt(0);
		return disconnectedCharacters.indexOf(code) != -1;
	}

	function ShapeArabicCharacters(word) {
		var shapedWord = "";

		for (var i = 0; i < word.length; i++) {
			if (!IsArabicCharacter(word[i])) {
				shapedWord += word[i];
				continue;
			}

			var connectedToPreviousChar = i-1 >= 0 && IsArabicCharacter(word[i-1]) && !IsDisconnectedCharacter(word[i-1]);

			var connectedToNextChar = i+1 < word.length && IsArabicCharacter(word[i+1]) && !IsDisconnectedCharacter(word[i]);

			var form;
			if (!connectedToPreviousChar && !connectedToNextChar) {
				form = CharacterForm.Isolated;
			}
			else if (connectedToPreviousChar && !connectedToNextChar) {
				form = CharacterForm.Final;
			}
			else if (!connectedToPreviousChar && connectedToNextChar) {
				form = CharacterForm.Initial;
			}
			else if (connectedToPreviousChar && connectedToNextChar) {
				form = CharacterForm.Middle;
			}

			var code = word[i].charCodeAt(0);

			// handle lam alef special case
			if (code == 0x0644 && connectedToNextChar) {
				var nextCode = word[i+1].charCodeAt(0);
				var specialCode = null;
				if (nextCode == 0x0622) {
					// alef madd
					specialCode = glyphForms[0x064b][form];
				}
				else if (nextCode == 0x0623) {
					// hamza above
					specialCode = glyphForms[0x064c][form];
				}
				else if (nextCode == 0x0625) {
					// hamza below
					specialCode = glyphForms[0x064d][form];
				}
				else if (nextCode == 0x0627) {
					// alef
					specialCode = glyphForms[0x064e][form];
				}

				if (specialCode != null) {
					shapedWord += String.fromCharCode(specialCode);
					i++; // skip a step
					continue;
				}
			}

			// hacky?
			if (form === CharacterForm.Isolated) {
				shapedWord += word[i];
				continue;
			}

			var shapedCode = glyphForms[code][form];
			shapedWord += String.fromCharCode(shapedCode);
		}

		return shapedWord;
	}

	this.ContainsArabicCharacters = ContainsArabicCharacters;
	this.ShapeArabicCharacters = ShapeArabicCharacters;
}

/* NEW TEXT EFFECTS */
var TextEffects = new Map();

var RainbowEffect = function() {
	this.DoEffect = function(char, time) {
		// console.log("RAINBOW!!!");
		// console.log(char);
		// console.log(char.color);
		// console.log(char.col);

		var h = Math.abs( Math.sin( (time / 600) - (char.col / 8) ) );
		var rgb = hslToRgb( h, 1, 0.5 );
		char.color.r = rgb[0];
		char.color.g = rgb[1];
		char.color.b = rgb[2];
		char.color.a = 255;
	}
};
TextEffects["rbw"] = new RainbowEffect();

var ColorEffect = function() {
	this.DoEffect = function(char, time, parameters) {
		var index = parameters[0];
		var pal = getPal(curPal());
		var color = pal[parseInt(index)];
		// console.log(color);
		char.color.r = color[0];
		char.color.g = color[1];
		char.color.b = color[2];
		char.color.a = 255;
	}
};
TextEffects["clr"] = new ColorEffect();

var WavyEffect = function() {
	this.DoEffect = function(char, time) {
		char.offset.y += Math.sin( (time / 250) - (char.col / 2) ) * 4;
	}
};
TextEffects["wvy"] = new WavyEffect();

var ShakyEffect = function() {
	function disturb(func, time, offset, mult1, mult2) {
		return func( (time * mult1) - (offset * mult2) );
	}

	this.DoEffect = function(char, time) {
		char.offset.y += 3
						* disturb(Math.sin,time,char.col,0.1,0.5)
						* disturb(Math.cos,time,char.col,0.3,0.2)
						* disturb(Math.sin,time,char.row,2.0,1.0);
		char.offset.x += 3
						* disturb(Math.cos,time,char.row,0.1,1.0)
						* disturb(Math.sin,time,char.col,3.0,0.7)
						* disturb(Math.cos,time,char.col,0.2,0.3);
	}
};
TextEffects["shk"] = new ShakyEffect();

// prototype of custom text effects
/*
  TODO
  - the multiple layers of callbacks for handler based scripts is awkward
  - need to figure out what this best way to return the results
  - use input and output? or properties for char?
  - need a special environment to avoid things like dialog and exits
*/
var CustomEffect = function() {
	this.DoEffect = function(char, time, parameters) {
		var dialogId = parameters[0];
		if (dialogId in dialog) {
			scriptNext.Run(dialog[dialogId], null, function(fnResult) {
				if (fnResult instanceof Function) {
					fnResult([char.color.r, char.color.g, char.color.b, char.offset.x, char.offset.y, time], null, function(result) {
						char.color.r = result[0];
						char.color.g = result[1];
						char.color.b = result[2];
						char.offset.x = result[3];
						char.offset.y = result[4];
					});
				}
			});
		}
	};
};
TextEffects["tfx"] = new CustomEffect();

var DebugHighlightEffect = function() {
	this.DoEffect = function(char) {
		char.color.r = 255;
		char.color.g = 255;
		char.color.b = 0;
		char.color.a = 255;
	}
}
TextEffects["_debug_highlight"] = new DebugHighlightEffect();

} // Dialog()