const BOX_WIDTH = 50;

warningGiven = false;
function lsLoad(key) {
  key = 'stretchy-' + key;
  try {
    value = localStorage.getItem(key);
    if (value === '' || value === null)
      return null;
    return JSON.parse(value);
  } catch (e) {
    if (!warningGiven) {
      alert("Cannot access local storage. Game state and puzzle records won't be saved.");
      warningGiven = true;
    }
    return null;
  }
}

function lsStore(key, value) {
  key = 'stretchy-' + key;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    // Just ignore errors
  }
}

function loadRecords() {
  return lsLoad('puzzle-records') || {};
}

function storeRecords(records) {
  lsStore('puzzle-records', records);
}

function range(min, max, step) {
  if (arguments.length === 1)
    [min, max, step] = [0, min, 1];
  if (arguments.length === 2)
    step = 1;
  let list = [];
  for (let x = min; x < max; x += step)
    list.push(x);
  return list;
}

function nextPuzzle(pID) {
  let [diff, puzzle] = pID;
  if (puzzle === PUZZLES[diff].puzzles.length - 1) {
    if (diff === DIFFICULTIES.length - 1)
      return null;
    return [diff + 1, 0];
  }
  return [diff, puzzle + 1];
}

function prevPuzzle(pID) {
  let [diff, puzzle] = pID;
  if (puzzle === 0) {
    if (diff === 0)
      return null;
    return [diff - 1, PUZZLES[diff - 1].puzzles.length - 1];
  }
  return [diff, puzzle - 1];
}

class Piece {
  constructor(props) {
    this.x = props.x;
    this.y = props.y;
    this.len = props.len;
    this.dir = props.dir;
    this.pos = props.pos;
    this.neg = props.neg;
  }
  serialize() {
    return this;
  }
}

class Req {
  constructor(props) {
    this.x = props.x;
    this.y = props.y;
  }
}

class Move {
  constructor(index, oldPiece, newPiece) {
    this.index = index;
    this.oldPiece = oldPiece;
    this.newPiece = newPiece;
  }
  serialize() {
    return this;
  }
}

class Board extends React.Component {
  constructor(props) {
    super(props);

    let [diff, puzzleID] = this.props.puzzleID;
    let puzzle = PUZZLES[diff].puzzles[puzzleID];

    let sizeX = puzzle[0].length;
    let sizeY = puzzle.length;

    let pieces = [];
    let reqs = [];
    for (let y in puzzle) {
      y = y|0;
      let line = puzzle[y];
      for (let x in line) {
        x = x|0;
        let c = line[x];
        if (/^[0-9]+$/.test(c))
          pieces.push(new Piece({len: c|0, x: x, y: y, dir: 0, pos: 0, neg: 0}));
        else if (c === '.')
          reqs.push(new Req({x: x, y: y}));
      }
    }

    let board = this.computeBoard(sizeX, sizeY, pieces);

    this.drag = this.drag.bind(this);
    this.dragStart = this.dragStart.bind(this);
    this.dragEnd = this.dragEnd.bind(this);

    this.scale = 1;

    this.state = {
      // Board state stuff
      puzzle: puzzle,
      sizeX: sizeX,
      sizeY: sizeY,
      board: board,
      pieces: pieces,
      reqs: reqs,

      // Undo/redo stuff
      moves: [],
      futureMoves: [],

      // Dragging stuff
      dragIndex: null,
      origPiece: null,
      dragPiece: null,
      dragX: null,
      dragY: null,
      dragAttr: null,
      dragDir: null,
      hasMoved: null,
    };
  }

  // Slow 'n' dumb 'n' easy
  computeBoard(sizeX, sizeY, pieces) {
    let board = [];
    for (let y of range(sizeY))
      board.push(range(sizeX).map(() => -1));

    for (let i in pieces) {
      i = i|0;
      let {x, y, dir, pos, neg} = pieces[i];
      let [w, h] = [1, 1];
      if (dir) {
        x -= neg;
        w += pos + neg;
      } else {
        y -= neg;
        h += pos + neg;
      }
      for (let yy of range(y, y+h))
        for (let xx of range(x, x+w)) {
          if (board[yy][xx] !== -1)
            throw 'error';
          board[yy][xx] = i;
        }
    }
    return board;
  }

  regen() {
    let board = this.computeBoard(this.state.sizeX, this.state.sizeY, this.state.pieces);

    this.setState({board: board});
  }

  isWon() {
    for (let p of this.state.pieces)
      if (p.pos + p.neg + 1 !== p.len)
        return false;
    for (let req of this.state.reqs)
      if (this.state.board[req.y][req.x] === -1)
        return false;
    return true;
  }

  updateRecords() {
    if (!this.isWon())
      throw 'bad update';

    // Grab the initial position string, so the records aren't sensitive to the ordering of puzzles.
    let posStr = this.state.puzzle.join('|');
    if (posStr) {
      let records = loadRecords();
      if (records[posStr] === undefined) {
        records[posStr] = true;
        storeRecords(records);
      }
    }
  }

  // Make a move. Sentinel value of null goes forward or backwards in history, depending on 'reverse'
  doMove(move, reverse) {
    let moves = this.state.moves;
    let futureMoves = this.state.futureMoves;
    if (move !== null) {
      moves.push(move);
      futureMoves = [];
    } else {
      if (reverse) {
        move = moves.pop();
        futureMoves.push(move);
      } else {
        move = futureMoves.pop();
        moves.push(move);
      }
    }

    // Update board
    let piece = reverse ? move.oldPiece : move.newPiece;
    this.state.pieces[move.index] = piece;
    this.regen();
    this.setState({pieces: this.state.pieces, moves: moves, futureMoves: futureMoves});

    // Store the backward/forward move history into local storage, as well as
    // this puzzle's initial configuration so we can verify them if the page gets reloaded
    lsStore('current-puzzle-pos', this.state.puzzle);
    lsStore('current-puzzle-moves', moves.map((m) => m.serialize()));
    lsStore('current-puzzle-future-moves', futureMoves.map((m) => m.serialize()));
  }

  getMouseCoords(e) {
    let bounds = document.getElementById('base-grid').getBoundingClientRect();
    // Ideally this would be clientX/Y, since pageX/Y seems to be viewport-relative and
    // wrong if the page is scrolled down, but clientX/Y doesn't seem to be there on
    // iOS for start/end touches, so whatever
    let [xa, ya] = [e.pageX - bounds.left, e.pageY - bounds.top];

    xa /= this.scale;
    ya /= this.scale;

    let [x, y] = [xa / BOX_WIDTH, ya / BOX_WIDTH];
    x = Math.max(0, Math.min(x, this.state.sizeX));
    y = Math.max(0, Math.min(y, this.state.sizeY));
    return [x | 0, y | 0];
  }

  dragStart(x, y, e) {
    e.stopPropagation();
    e.preventDefault();
    if (e.targetTouches && e.targetTouches.length)
      e = e.targetTouches[0];
    if (e.button !== undefined && e.button !== 0)
      return;
    let idx = this.state.board[y][x];
    if (idx === -1)
      return;

    let p = new Piece({...this.state.pieces[idx]});

    let attr = null;
    let dir = null;
    let hasMoved = false;
    // Check for starting off center
    if (x !== p.x || y !== p.y) {
      dir = p.dir;
      let delta = dir ? x - p.x : y - p.y;

      attr = delta > 0 ? 'pos' : 'neg';

      // Only respond on the endpoints
      if (Math.abs(delta) !== p[attr])
        return;

      hasMoved = true;
    }

    this.setState({dragX: x, dragY: y, centerX: x, centerY: y,
      dragIndex: idx, origPiece: p, dragPiece: p,
      dragAttr: attr, dragDir: dir, hasMoved: hasMoved});
  }

  drag(e) {
    // Prevent default whether we're actually dragging a piece or not, to prevent
    // overscrolling. Pretty hacky!
    e.preventDefault();

    if (this.state.dragIndex === null)
      return;
    e.stopPropagation();
    if (e.targetTouches && e.targetTouches.length)
      e = e.targetTouches[0];

    let [nx, ny] = this.getMouseCoords(e);

    // Start with a copy of the original piece
    let op = this.state.origPiece;
    let dp = new Piece({...op});

    // Delta, step, bound for x and y
    let [dx, dy] = [nx - dp.x, ny - dp.y];
    let [sx, sy] = [0, 0];
    let [bx, by] = [-1, -1];

    let steps = 0;
    let dir = dp.dir;
    let attr = this.state.dragAttr || null;

    if (Math.abs(dx) > Math.abs(dy)) {
      // Horizontal
      dir = 1;
      if (dx > 0) {
        steps = dx;
        attr = 'pos';
        sx = 1;
        bx = this.state.sizeX;
      } else {
        steps = -dx;
        attr = 'neg';
        sx = -1;
        bx = -1;
      }
    } else if (dy !== 0) {
      // Vertical
      dir = 0;
      if (dy > 0) {
        steps = dy;
        attr = 'pos';
        sy = 1;
        by = this.state.sizeY;
      } else {
        steps = -dy;
        attr = 'neg';
        sy = -1;
        by = -1;
      }
    }

    // If this drag started from an endpoint, only allow drags in that direction
    if (this.state.dragDir !== null &&
        (this.state.dragDir !== dir || this.state.dragAttr !== attr))
      return;

    // Extend this side of the piece while it's legal
    let [x, y] = [dp.x, dp.y];
    let i = 0;
    for (; i < steps; i++) {
      let [x2, y2] = [x + sx, y + sy];
      if (x2 === bx || y2 === by)
        break;
      if (this.state.board[y2][x2] !== -1 && this.state.board[y2][x2] !== this.state.dragIndex)
        break;
      [x, y] = [x2, y2];
    }

    if (dp.dir !== dir)
      dp.pos = dp.neg = 0;

    if (attr !== null) {
      dp.dir = dir;
      dp[attr] = i;
    }

    if (!this.state.hasMoved && (nx !== this.state.centerX || ny !== this.state.centerY))
      this.setState({hasMoved: true});

    this.state.pieces[this.state.dragIndex] = dp;
    this.setState({dragX: x, dragY: y, dragPiece: dp});
    this.regen();
  }

  dragEnd(e) {
    if (this.state.dragIndex === null)
      return;
    e.stopPropagation();
    e.preventDefault();
    if (e.targetTouches && e.targetTouches.length)
      e = e.targetTouches[0];

    let op = this.state.origPiece;
    let dp = this.state.dragPiece;

    // Reset the piece if the center was clicked and not dragged
    let [x, y] = this.getMouseCoords(e);
    if (!this.state.hasMoved && x === dp.x && y === dp.y)
      dp.pos = dp.neg = 0;

    // Make this move
    this.doMove(new Move(this.state.dragIndex, op, dp), false);

    if (this.isWon())
      this.updateRecords();

    // Cancel drag stuff
    this.setState({dragX: null, dragY: null, dragIndex: null});
  }

  componentWillMount() {
    // Make the mouse move/mouse up event handlers global, since we want to know whenever these
    // things happen, no matter where the mouse is
    document.addEventListener('mousemove', this.drag, { passive: false });
    document.addEventListener('mouseup', this.dragEnd, { passive: false });
    document.addEventListener('touchmove', this.drag, { passive: false });
    document.addEventListener('touchend', this.dragEnd, { passive: false });

    // Try to grab move lists for this puzzle, making sure they're for this puzzle
    let lsPos = lsLoad('current-puzzle-pos');
    if (lsPos && lsPos.join('|') === this.state.puzzle.join('|')) {
      // We have to set these move lists up in a particular order, since doMove overwrites the
      // values in local storage. So first, we load both the backward and forward lists.
      // Then, make all the moves in the backwards list, and finally, load the future moves.
      let moves = lsLoad('current-puzzle-moves') || [];
      let futureMoves = lsLoad('current-puzzle-future-moves') || [];
      for (let move of moves)
        this.doMove(new Move(move.index, move.oldPiece, move.newPiece), false);
      this.setState({futureMoves: futureMoves.map((move) =>
          new Move(move.index, move.oldPiece, move.newPiece))});
    }
  }

  componentWillUnmount() {
    document.removeEventListener('mousemove', this.drag);
    document.removeEventListener('mouseup', this.dragEnd);
    document.removeEventListener('touchmove', this.drag);
    document.removeEventListener('touchend', this.dragEnd);
  }

  render() {
    let record = null;

    let width = BOX_WIDTH * this.state.sizeX;
    let height = BOX_WIDTH * this.state.sizeY;

    const getCoords = (p) => {
      const x = width * (p.x + .5) / this.state.sizeX;
      const y = height * (p.y + .5) / this.state.sizeY;
      return [x, y];
    }

    // Grid drawing helper
    const grid = (x1, x2, y1, y2, cls) => 
      range(x1, x2).map((x) =>
        range(y1, y2).map((y) => {
          let xa = width * x / this.state.sizeX;
          let ya = height * y / this.state.sizeY;
          let handler = cls === 'touch' ? (e) => this.dragStart(x, y, e) : null;
          return <rect className={ cls } x={ xa } y={ ya } width={ BOX_WIDTH } height={ BOX_WIDTH }
            onMouseDown={ handler } onTouchStart={ handler } />;
        }))

    // Rectangle drawing helper
    const rect = (x, y, w, h, cls) => {
      x = width * x / this.state.sizeX;
      y = height * y / this.state.sizeY;
      w = width * w / this.state.sizeX;
      h = height * h / this.state.sizeY;
      return <rect className={ cls } x={ x } y={ y } width={ w } height={ h } />;
    }

    // Piece drawing helper
    const pieceElems = (cls) => this.state.pieces.map((p, i) => {
      let {x, y} = p;
      let [w, h] = [1, 1];
      if (p.dir) {
        x -= p.neg;
        w += p.pos + p.neg;
      } else {
        y -= p.neg;
        h += p.pos + p.neg;
      }

      let g = null;
      let c = cls;
      if (cls === 'piece-fill') {
        // ugh
        g = grid(x, x+w, y, y+h, 'grid-cover');

        // also ugh
        if (p.pos + p.neg + 1 === p.len)
          c = 'piece-good';
      }

      return [rect(x, y, w, h, c), g];
    });

    let [diff, puzzleID] = this.props.puzzleID;
    let puzzleName = `${PUZZLES[diff].difficulty}/${puzzleID + 1}`;
    let [prev, next] = [prevPuzzle(this.props.puzzleID), nextPuzzle(this.props.puzzleID)];

    // Scale width/height to fit within window constraints
    let [mw, mh] = [window.outerWidth - 50, window.outerHeight - 50];
    let scale = Math.min(1, mw / width, mh / height);
    let [dw, dh] = [(width + 8) * scale, (height + 8) * scale];
    this.scale = scale;

    let isWon = (this.state.dragIndex === null && this.isWon());

    // Draw the full board, with appropriate layering to get the grid/pieces/etc to
    // look right
    return <div>
        <div className={ isWon ? 'overlay win-overlay' : 'overlay' }>
          { isWon ?
              <div style={{ display: 'table-cell', verticalAlign: 'middle' }}>
                <div>Nice.</div>
                <div>
                  <input type='button' disabled={ this.state.moves.length === 0 }
                      onClick={ (e) => this.doMove(null, true) }
                      className='button medButton' value='Stay Here'/>
                </div>
                <div>
                  <input type='button' disabled={ next === null }
                      onClick={ (e) => this.props.selectPuzzle(next) }
                      className='button medButton' value='Next Puzzle'/>
                </div>
              </div>
              : <span /> }
        </div>

        <div>
          { /* Puzzle selector */ }
          <span>Puzzle: { puzzleName }</span>
          <input type='button' disabled={ prev === null }
              onClick={ (e) => this.props.selectPuzzle(prev) }
              className='button smallButton' value='prev'/>
          <input type='button' disabled={ next === null }
              onClick={ (e) => this.props.selectPuzzle(next) }
              className='button smallButton' value='next'/>
          <input type='button' onClick={ (e) => this.props.selectPuzzle(null) }
              className='button smallButton' value='list' />
        </div>

        <svg id='base-grid' width={ dw } height={ dh } fill='white'>
          <g transform={ `scale(${scale})` }>
            <g transform="translate(4,4)">

              { grid(0, this.state.sizeX, 0, this.state.sizeY, 'grid') }

              { pieceElems('piece-fill') }

              { this.state.dragIndex !== null &&
                  rect(this.state.dragX, this.state.dragY, 1, 1, 'piece-highlight') }

              { pieceElems('piece-outline') }

              { // Piece labels
                this.state.pieces.map((p) => {
                  let [x, y] = getCoords(p);
                  let cls = (p.x === this.state.dragX && p.y === this.state.dragY) ?
                    'piece-label label-highlight' : 'piece-label';
                  return <text className={ cls } x={ x } y={ y }>{ p.len }</text>;
                }) }

              { // Required squares
                this.state.reqs.map((r) => {
                  let [x, y] = getCoords(r);
                  let cls = (this.state.board[r.y][r.x] === -1) ? 'req' : 'req-cover';
                  return <circle className={ cls } cx={ x } cy={ y } />;
                }) }

              { grid(0, this.state.sizeX, 0, this.state.sizeY, 'touch') }

            </g>
          </g>
        </svg>

        <div>
          { /* Undo/redo */ }
          <input type='button' disabled={ this.state.moves.length === 0 }
              onClick={ (e) => this.doMove(null, true) }
              className='button smallButton' value='undo'/>
          <input type='button' disabled={ this.state.futureMoves.length === 0 }
              onClick={ (e) => this.doMove(null, false) }
              className='button smallButton' value='redo'/>
          <input type='button' disabled={ this.state.moves.length === 0 }
              onClick={ (e) => range(this.state.moves.length).map(() => this.doMove(null, true)) }
              className='button smallButton' value='reset'/>
        </div>

      </div>;
  }
}

class PuzzleList extends React.Component {
  render() {
    let records = loadRecords();
    let vspacer = <div style={{ paddingTop: '10px' }}/>;
    return <div>
        <div>Select a puzzle!</div>
        { vspacer }
        <div>
            Jump to: { DIFFICULTIES.map((diff) =>
                <a className='button smallButton' href={ `#${diff}` }>{ diff }</a>) }
        </div>
        { vspacer }
        <div className="list-holder">
          <table><tbody>
            { PUZZLES.map((pList, diff) =>
              [<span id={ pList.difficulty } />,
                pList.puzzles.map((p, i) => {
                  let record = records[p.join('|')];
                  return <tr key={ i } onClick={() => this.props.selectPuzzle([diff, i])} >
                      <td style={{ textAlign: 'left' }}>
                        <div><strong>Puzzle { i + 1 }</strong></div>
                        <div>{ pList.difficulty }</div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        { record ? <font color="green">{ '\u2713' }</font> : null }
                      </td>
                    </tr>;
                })]) }
          </tbody></table>
        </div>
      </div>;
  }
}

class Base extends React.Component {
  constructor(props) {
    super(props);

    this.selectPuzzle = this.selectPuzzle.bind(this);

    // Try to load the current puzzle from local storage
    let pID = lsLoad('current-puzzle');
    this.state = {currentPuzzle: pID};
  }

  selectPuzzle(pID) {
    this.setState({currentPuzzle: pID});

    let pos = null;
    if (pID !== null) {
      let [diff, puzzle] = pID;
      pos = PUZZLES[diff].puzzles[puzzle];
    }

    // Store the selected puzzle in local storage, and erase the move lists
    lsStore('current-puzzle', pID);
    lsStore('current-puzzle-pos', pos);
    lsStore('current-puzzle-moves', []);
    lsStore('current-puzzle-future-moves', []);
  }

  render() {
    return <div id='base-center'>
          { this.state.currentPuzzle !== null ?
            <Board key={ this.state.currentPuzzle } puzzleID={ this.state.currentPuzzle }
                selectPuzzle={ this.selectPuzzle } />
            : <PuzzleList selectPuzzle={ this.selectPuzzle }/> }
        </div>;
  }
}
