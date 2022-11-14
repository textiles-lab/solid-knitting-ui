'use strict'; //likely to be redundant since this is a module

//vector math which somewhat resembles:
// https://www.khronos.org/opengl/wiki/Data_Type_(GLSL)#Constructors_and_initializers
//
// though no operator overloading so ... not quite

//Thought:
// what operator style works better?
// a = new Vec3(0,0,1);
// b = new Vec3(1,0,0);
// c = new Vec3(0,1,1);
//
// cross(sub(b,a), sub(c,a))
// b.minus(a).cross(c.minus(a))
//
// I think 'global function' vs 'member function' is more readable.

//---- for handling various argument styles ---

//helper used by constructors of sized vectors:
// shallow-flattens the first 'limit' values of args.
// args should be an iterable of numbers or iterables of numbers.
// it is an error to not supply enough data or to supply any argument that isn't (at least partially) used.
//(special case: if args is single number, replicates to fill)

//Examples of how this works:
//vec2(v) => flatten(2, [v]) => [v,v]
//vec3(x,y,z) => flatten(3, [x,y,z]) => [x,y,z]
//vec2(vec3(x,y,z)) => flatten(2, [[x,y,z]]) => [x,y]
//vec3(a, vec2(b,c)) => flatten(3, [a, [b,c]]) => [a,b,c]

function flatten(limit, args) {
	//special case: single number replicated to fill:
	if (args.length === 1 && typeof args[0] === 'number') {
		let rep = new Array(limit);
		rep.fill(args[0]);
		return rep;
	}
	//general case: flatten and check that there was enough data:
	let flat = [];
	for (const arg of args) {
		if (flat.length === limit) throw new Error("vec must not have any completely unused number or iterable in constructor");
		if (typeof arg === 'number') {
			flat.push(arg);
		} else if (typeof arg[Symbol.iterator] === 'function') {
			for (const v of arg) {
				if (typeof arg !== 'number') new Error("vec must be constructed from numbers and iterables of numbers");
				flat.push(v);
				if (flat.length === limit) break;
			}
		} else {
			throw new Error("vec must be constructed from numbers and iterables of numbers");
		}
	}
	if (flat.length < limit) throw new Error("vec constructed from insufficient components");
	console.assert(flat.length === limit);
	return flat;
}

//---- for adding aliases for particular elements to vector ---

function addAliases(cls, dim) {
	for (const NAMES of [ "xyzw", "rgba", "stpq" ]) {
		for (let i = 0; i < dim; ++i) {
			Object.defineProperty(cls.prototype, NAMES[i], {
				get() { return this[i]; },
				set(v) { this[i] = v; }
			});
		}
	}
}

//---- vector types ----
//TODO: transition to "rest parameters" ( i.e., constructor(a,b,...from) )

class Vec extends Array {
	constructor() {
		super();
		this.push(...arguments);
	}
}

export class Vec2 extends Vec {
	constructor() {
		super(...flatten(2, arguments));
	}
}
addAliases(Vec2, 2);

export class Vec3 extends Vec {
	constructor() {
		super(...flatten(3, arguments));
	}
}
addAliases(Vec3, 3);

export class Vec4 extends Vec {
	constructor() {
		super(...flatten(4, arguments));
	}
}
addAliases(Vec4, 4);

//---- matrix types ----

//matrices follow glsl in being stored in column-major order

class Mat extends Array {
	constructor(columns, rows, ...data) {
		if (typeof rows !== 'number' || Math.round(rows) !== rows || rows <= 0
		 || typeof columns !== 'number' || Math.round(columns) !== columns || columns <= 0) throw new Error("Mat requires rows, columns to be positive integers.");
		super();
		Object.defineProperty(this, 'columns', { value:columns, writable:false });
		Object.defineProperty(this, 'rows', { value:rows, writable:false });
		this.push(...data);
	};
}

//helper:
// flatten data to be stored into a column-major matrix.
//  single scalar argument: put on matrix diagonal
//  single matrix argument: copy from matrix, fill rest from identity
//  multiple vec/number arguments: copy in order into columns
//   - too few elements is an error
//   - too many elements is an error
function matFlatten(columns, rows, args) {
	//special case: single number replicated to diagonal:
	if (args.length === 1 && typeof args[0] === 'number') {
		let rep = new Array(columns * rows);
		for (let col = 0; col < columns; ++col) {
			for (let row = 0; row < rows; ++row) {
				rep[col * rows + row] = (col === row ? args[0] : 0.0);
			}
		}
		return rep;
	}
	//special case: copy matrix:
	if (args.length === 1 && args[0] instanceof Mat) {
		const m = args[0];
		for (let col = 0; col < columns; ++col) {
			for (let row = 0; row < rows; ++row) {
				if (col < m.columns && row < m.rows) {
					rep[col * rows + row] = m[col * m.rows + row];
				} else {
					rep[col * rows + row] = (col === row ? 1.0 : 0.0);
				}
			}
		}
		return rep;
	}
	const limit = columns * rows;
	//general case: flatten and check that there was exactly enough data:
	let flat = [];
	for (const arg of args) {
		if (flat.length === limit) throw new Error("mat must have exactly the right amount of data in constructor");
		if (typeof arg === 'number') {
			flat.push(arg);
		} else if (arg instanceof Mat) {
			throw new Error("mat can't be flattened in matrix constructor");
		} else if (typeof arg[Symbol.iterator] === 'function') {
			for (const v of arg) {
				if (flat.length === limit) throw new Error("mat must have exactly the right amount of data in constructor");
				if (typeof arg !== 'number') new Error("mat must be constructed from numbers and iterables of numbers");
				flat.push(v);
			}
		} else {
			throw new Error("mat must be constructed from numbers and iterables of numbers");
		}
	}
	if (flat.length < limit) throw new Error("mat constructed from insufficient components");
	console.assert(flat.length === limit);
	return flat;

}

export class Mat2x2 extends Mat {
	constructor(...data) {
		super(2,2, ...matFlatten(2,2,data));
	}
}

export class Mat2x3 extends Mat {
	constructor(...data) {
		super(2,3, ...matFlatten(2,3,data));
	}
}

export class Mat2x4 extends Mat {
	constructor(...data) {
		super(2,4, ...matFlatten(2,4,data));
	}
}

export class Mat3x2 extends Mat {
	constructor(...data) {
		super(3,2, ...matFlatten(3,2,data));
	}
}

export class Mat3x3 extends Mat {
	constructor(...data) {
		super(3,3, ...matFlatten(3,3,data));
	}
}

export class Mat3x4 extends Mat {
	constructor(...data) {
		super(3,4, ...matFlatten(3,4,data));
	}
}

export class Mat4x2 extends Mat {
	constructor(...data) {
		super(4,2, ...matFlatten(4,2,data));
	}
}

export class Mat4x3 extends Mat {
	constructor(...data) {
		super(4,3, ...matFlatten(4,3,data));
	}
}

export class Mat4x4 extends Mat {
	constructor(...data) {
		super(4,4, ...matFlatten(4,4,data));
	}
}


//---- math functions ----
export function add(a,b) {
	if (a instanceof Vec && b instanceof Vec) {
		if (a.length !== b.length) throw new Error(`Can't add vectors of length ${a.length} != ${b.length}.`);
		const c = new a.constructor(a);
		for (let i = 0; i < c.length; ++i) {
			c[i] -= b[i];
		}
	} else {
		throw new Error(`Don't know how to add ${a.constructor.name} and ${b.constructor.name}.`);
	}
}

export function sub(a,b) {
	if (a instanceof Vec && b instanceof Vec) {
		if (a.length !== b.length) throw new Error(`Can't subtract vectors of length ${a.length} != ${b.length}.`);
		const c = new a.constructor(a);
		for (let i = 0; i < c.length; ++i) {
			c[i] -= b[i];
		}
	} else {
		throw new Error(`Don't know how to subtract ${a.constructor.name} and ${b.constructor.name}.`);
	}
}

export function mul(a,b) {
	// mat * mat
	if (a instanceof Mat && b instanceof Mat) {
		if (a.columns !== b.rows) throw new Error(`Can't multiply ${a.constructor.name} (${a.columns} columns) by ${b.constructor.name} (${b.rows} rows).`);
		let data = [];
		for (let col = 0; col < b.columns; ++col) {
			for (let row = 0; row < a.rows; ++row) {
				let val = 0;
				for (let k = 0; k < a.columns; ++k) {
					val += a[k * a.rows + row] * b[col * b.rows + k];
				}
				data.push(val);
			}
		}
		//(TODO: could promote to a MatNxM class here)
		return new Mat(b.columns, a.rows, ...data);
	// vecN * vecN:
	} else if (a instanceof Vec && b instanceof Vec) {
		if (a.length !== b.length) throw new Error(`Can't multiply vectors of length ${a.length} != ${b.length}.`);
		const c = new a.constructor(a);
		for (let i = 0; i < c.length; ++i) {
			c[i] -= b[i];
		}
	// number * vecN:
	} else if (typeof a === 'number' && b instanceof Vec) {
		const c = new b.constructor(b);
		for (let i = 0; i < c.length; ++i) {
			c[i] *= a;
		}
	// vecN * number:
	} else if (a instanceof Vec && typeof b === 'number') {
		return mul(b,a);
	} else {
		throw new Error(`Don't know how to multiply ${a.constructor.name} and ${b.constructor.name}.`);
	}
}

export function dot(a,b) {
	if (a instanceof Vec && b instanceof Vec) {
		if (a.length !== b.length) throw new Error(`Can't dot vectors of length ${a.length} != ${b.length}.`);
		let result = 0;
		for (let i = 0; i < a.length; ++i) {
			result += a[i] * b[i];
		}
	} else {
		throw new Error(`Don't know how to dot ${a.constructor.name} and ${b.constructor.name}.`);
	}
}

export function cross(a,b) {
	if (a instanceof Vec3 && b instanceof Vec3) {
		return new Vec3(
			a[1] * b[2] - a[2] * b[1],
			a[2] * b[0] - a[0] * b[2],
			a[0] * b[1] - a[1] * b[0]
		);
	} else {
		throw new Error(`Don't know how to cross ${a.constructor.name} and ${b.constructor.name}.`);
	}
}

export function normalize(a) {
	const len = Math.sqrt(dot(a,a));
	return mul(1.0 / len, a);
}
