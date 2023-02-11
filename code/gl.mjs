 
// work-in-progress: factoring out some webgl helpers from the main blob

export class Geometry {
	constructor(gl, attribs, type, count) {
		if (typeof attribs !== 'object') throw new Error("Geometry needs an object describing attribs as second argument.");
		if (typeof count !== 'number') throw new Error("Geometry needs a 'count' as third argument.");

		this.gl = gl;
		this.attribs = attribs;
		this.type = type;
		this.count = count;
	}
	draw(program, type = this.type, start = 0, count = this.count - start) {
		const gl = this.gl;

		//--- bind ---
		for (const name in program.attribLocations) {
			if (name in this.attribs) {
				const attrib = this.attribs[name];
				if (Array.isArray(attrib)) {
					gl.disableVertexAttribArray(program.attribLocations[name]);
					gl.vertexAttrib4f(program.attribLocations[name],
						(attrib.length > 0 ? attrib[0] : 0.0),
						(attrib.length > 1 ? attrib[1] : 0.0),
						(attrib.length > 2 ? attrib[2] : 0.0),
						(attrib.length > 3 ? attrib[3] : 1.0)
					);
				} else {
					gl.enableVertexAttribArray(program.attribLocations[name]);
					gl.bindBuffer(gl.ARRAY_BUFFER, attrib.buffer);
					gl.vertexAttribPointer(program.attribLocations[name],
						attrib.size,
						attrib.type,
						attrib.normalize,
						attrib.stride,
						attrib.offset
					);
				}
			} else {
				this.warned = this.warned || {};
				if (!this.warned[name]) {
					this.warned[name] = true;
					console.warn(`Missing attrib: ${name}.`);
				}
				gl.disableVertexAttribArray(program.attribLocations[name]);
				gl.vertexAttrib4f(program.attribLocations[name], 0.0, 0.0, 0.0, 1.0);
			}
		}

		//--- emit ---
		gl.drawArrays(type, start, count);
	}

}


export class Program {
	constructor(gl, vsSource, fsSource) {
		this.gl = gl;
	
		function loadShader(type, source) {
			const shader = gl.createShader(type);
			gl.shaderSource(shader, source);
			gl.compileShader(shader);
			if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
				console.error('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader));
				gl.deleteShader(shader);
				return null;
			}
			return shader;
		}

		const vertexShader = loadShader(gl.VERTEX_SHADER, vsSource);
		const fragmentShader = loadShader(gl.FRAGMENT_SHADER, fsSource);

		this.program = gl.createProgram();
		gl.attachShader(this.program, vertexShader);
		gl.attachShader(this.program, fragmentShader);
		gl.linkProgram(this.program);

		if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
			console.error('Unable to initialize the shader program: ' + gl.getProgramInfoLog(this.program));
			return null;
		}

		this.attribLocations = {};
		this.uniformLocations = {};

		const attribCount = gl.getProgramParameter(this.program, gl.ACTIVE_ATTRIBUTES);
		for (let i = 0; i < attribCount; ++i) {
			const attrib = gl.getActiveAttrib(this.program, i);
			this.attribLocations[attrib.name] = gl.getAttribLocation(this.program, attrib.name);
		}

		const uniformCount = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS);
		for (let i = 0; i < uniformCount; ++i) {
			const uniform = gl.getActiveUniform(this.program, i);
			this.uniformLocations[uniform.name] = gl.getUniformLocation(this.program, uniform.name);
		}
	}
}

// Load a texture from url. While texture is loading, it is substituted by a single white pixel
// based on: https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Tutorial/Using_textures_in_WebGL
export function loadTexture(gl, url) {
	const texture = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, texture);

	// temp image (single white pixel)
	gl.texImage2D(
		gl.TEXTURE_2D, 0 /* level */, gl.RGBA /* internal format */, 1 /* width */, 1 /* height */, 0 /* border */,
		gl.RGBA /* src format */, gl.UNSIGNED_BYTE /* src type */, new Uint8Array([255, 255, 255, 255]) /* src image */
	);

	const image = new Image();
	image.onload = () => {
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texImage2D(
			gl.TEXTURE_2D, 0 /* level */, gl.RGBA /* internal format */, gl.RGBA /* src format */, gl.UNSIGNED_BYTE /* src type */,
			image
		);

		function isPowerOf2(value) {
			return (value & (value - 1)) === 0;
		}
		if (isPowerOf2(image.width) && isPowerOf2(image.height)) {
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
			gl.generateMipmap(gl.TEXTURE_2D);
		} else {
			console.err("Image dimensions are not powers of 2: ", image.width, image.height, image);
		}
	};
	image.src = url;

	return texture;
}
