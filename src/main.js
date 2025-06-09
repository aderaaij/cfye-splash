class VHSGlitchEffect {
  constructor() {
    this.canvas = document.getElementById("glitchCanvas");
    this.gl =
      this.canvas.getContext("webgl") ||
      this.canvas.getContext("experimental-webgl");
    this.texture = null;
    this.program = null;
    this.time = 0;
    this.glitchIntensity = 0;
    this.targetGlitchIntensity = 0;
    this.imageWidth = 512; // Default fallback
    this.imageHeight = 512; // Default fallback

    this.init();
  }

  init() {
    if (!this.gl) {
      console.error("WebGL not supported");
      document.querySelector(".loading").textContent =
        "WebGL not supported in this browser";
      return;
    }

    console.log("WebGL context created successfully");
    console.log("WebGL version:", this.gl.getParameter(this.gl.VERSION));
    console.log(
      "GLSL version:",
      this.gl.getParameter(this.gl.SHADING_LANGUAGE_VERSION)
    );

    this.setupCanvas();
    this.createShaders();
    this.loadLogo();
    this.setupGlitchTiming();
    this.render();
  }

  setupCanvas() {
    const resizeCanvas = () => {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    // Remove the click handler and cursor style since we're removing the mailto functionality
    // this.canvas.addEventListener("click", (event) => { ... });
    // this.canvas.style.cursor = "pointer";
  }

  createShaders() {
    const vertexShaderSource = `
                    attribute vec2 a_position;
                    attribute vec2 a_texCoord;
                    uniform vec2 u_resolution;
                    uniform vec2 u_imageSize;
                    varying vec2 v_texCoord;
                    
                    void main() {
                        // Calculate aspect ratios
                        float screenAspect = u_resolution.x / u_resolution.y;
                        float imageAspect = u_imageSize.x / u_imageSize.y;
                        
                        // Scale to fit while maintaining aspect ratio
                        vec2 scale = vec2(1.0);
                        if (imageAspect > screenAspect) {
                            // Image is wider - fit to width
                            scale.y = screenAspect / imageAspect;
                        } else {
                            // Image is taller - fit to height
                            scale.x = imageAspect / screenAspect;
                        }
                        
                        // Scale down to be reasonable size (max 80% of screen)
                        scale *= 0.8;
                        
                        gl_Position = vec4(a_position * scale, 0.0, 1.0);
                        v_texCoord = a_texCoord;
                    }
                `;

    const fragmentShaderSource = `
                    precision mediump float;
                    uniform sampler2D u_texture;
                    uniform float u_time;
                    uniform float u_glitchIntensity;
                    varying vec2 v_texCoord;

                    float random(vec2 st) {
                        return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
                    }

                    vec3 rgbShift(sampler2D tex, vec2 uv, float intensity) {
                        float r = texture2D(tex, uv + vec2(intensity * 0.01, 0.0)).r;
                        float g = texture2D(tex, uv).g;
                        float b = texture2D(tex, uv - vec2(intensity * 0.01, 0.0)).b;
                        return vec3(r, g, b);
                    }

                    void main() {
                        vec2 uv = v_texCoord;
                        
                        // Moving VHS scanlines
                        float scanlineOffset = u_time * 0.15; // Slowed down from 0.5 to 0.15
                        float scanlineY = uv.y + scanlineOffset;
                        float scanline = sin(scanlineY * 800.0) * 0.04;
                        
                        // Glitching scanlines - occasionally they jump or distort
                        float scanlineGlitch = random(vec2(floor(scanlineY * 100.0), floor(u_time * 5.0)));
                        if (scanlineGlitch > 0.98) { // Made it less frequent (0.98 instead of 0.95)
                            scanline *= 2.0; // Reduced intensity from 3.0 to 2.0
                        }
                        
                        // Add thicker scanline bands that move slower
                        float thickScanline = sin((scanlineY + u_time * 0.03) * 50.0) * 0.02; // Slowed from 0.1 to 0.03
                        scanline += thickScanline;
                        
                        // Horizontal distortion with scanline interference
                        float noise = random(vec2(floor(uv.y * 150.0), floor(u_time * 10.0)));
                        float distortion = (noise - 0.5) * u_glitchIntensity * 0.1;
                        
                        // Add scanline-based distortion - some lines get extra wonky
                        float scanlineDistort = step(0.985, random(vec2(floor(scanlineY * 200.0), floor(u_time * 8.0)))); // Less frequent (0.985 vs 0.97)
                        distortion += scanlineDistort * (noise - 0.5) * 0.03; // Reduced strength from 0.05 to 0.03
                        
                        uv.x += distortion;
                        
                        // Vertical glitch bars
                        float glitchBar = step(0.98, random(vec2(floor(uv.y * 25.0), floor(u_time * 15.0))));
                        uv.x += glitchBar * (noise - 0.5) * u_glitchIntensity * 0.2;
                        
                        // RGB shift
                        vec3 color = rgbShift(u_texture, uv, u_glitchIntensity);
                        
                        // Add moving scanlines
                        color -= scanline;
                        
                        // Occasional scanline color bleeding
                        if (scanlineGlitch > 0.98) { // Made consistent with above threshold
                            color.r += 0.06; // Reduced from 0.1 to 0.06
                            color.g -= 0.03; // Reduced from 0.05 to 0.03
                        }
                        
                        // VHS color grading
                        color.r *= 1.1;
                        color.g *= 0.95;
                        color.b *= 0.9;
                        
                        // Add some noise for texture
                        float grain = random(uv + u_time) * 0.05;
                        color += grain;
                        
                        // Vignette effect
                        vec2 center = uv - 0.5;
                        float vignette = 1.0 - dot(center, center) * 0.3;
                        color *= vignette;
                        
                        gl_FragColor = vec4(color, 1.0);
                    }
                `;

    const vertexShader = this.createShader(
      this.gl.VERTEX_SHADER,
      vertexShaderSource
    );
    const fragmentShader = this.createShader(
      this.gl.FRAGMENT_SHADER,
      fragmentShaderSource
    );

    this.program = this.gl.createProgram();
    this.gl.attachShader(this.program, vertexShader);
    this.gl.attachShader(this.program, fragmentShader);
    this.gl.linkProgram(this.program);

    if (!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS)) {
      const error = this.gl.getProgramInfoLog(this.program);
      console.error("Shader program failed to link:", error);
      document.querySelector(".loading").textContent = "Shader linking failed";
      return;
    }

    console.log("Shader program linked successfully");
    this.setupBuffers();
  }

  createShader(type, source) {
    const shader = this.gl.createShader(type);
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);

    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      const error = this.gl.getShaderInfoLog(shader);
      console.error("Shader compile error:", error);
      console.error("Shader source:", source);
      document.querySelector(".loading").textContent =
        "Shader compilation failed";
      this.gl.deleteShader(shader);
      return null;
    }

    console.log("Shader compiled successfully");
    return shader;
  }

  setupBuffers() {
    // Create quad vertices
    const vertices = new Float32Array([
      -1, -1, 0, 1, 1, -1, 1, 1, -1, 1, 0, 0, 1, 1, 1, 0,
    ]);

    this.buffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);

    this.positionLocation = this.gl.getAttribLocation(
      this.program,
      "a_position"
    );
    this.texCoordLocation = this.gl.getAttribLocation(
      this.program,
      "a_texCoord"
    );
    this.timeLocation = this.gl.getUniformLocation(this.program, "u_time");
    this.glitchLocation = this.gl.getUniformLocation(
      this.program,
      "u_glitchIntensity"
    );
    this.resolutionLocation = this.gl.getUniformLocation(
      this.program,
      "u_resolution"
    );
    this.imageSizeLocation = this.gl.getUniformLocation(
      this.program,
      "u_imageSize"
    ); // This was missing!
    this.textureLocation = this.gl.getUniformLocation(
      this.program,
      "u_texture"
    );
  }

  loadLogo() {
    const img = new Image();
    img.onload = () => {
      this.imageWidth = img.width; // Capture image dimensions
      this.imageHeight = img.height; // Capture image dimensions
      this.createTextureFromImage(img);
      document.querySelector(".loading").style.display = "none";
    };
    img.onerror = () => {
      console.error("Failed to load logo.png");
      document.querySelector(".loading").textContent = "Failed to load logo";
    };
    img.src = "logo.png";
  }

  createTextureFromImage(img) {
    this.texture = this.gl.createTexture();
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      img
    );
    this.gl.texParameteri(
      this.gl.TEXTURE_2D,
      this.gl.TEXTURE_WRAP_S,
      this.gl.CLAMP_TO_EDGE
    );
    this.gl.texParameteri(
      this.gl.TEXTURE_2D,
      this.gl.TEXTURE_WRAP_T,
      this.gl.CLAMP_TO_EDGE
    );
    this.gl.texParameteri(
      this.gl.TEXTURE_2D,
      this.gl.TEXTURE_MIN_FILTER,
      this.gl.LINEAR
    );
    this.gl.texParameteri(
      this.gl.TEXTURE_2D,
      this.gl.TEXTURE_MAG_FILTER,
      this.gl.LINEAR
    );
  }

  setupGlitchTiming() {
    // Random glitch intervals
    setInterval(() => {
      if (Math.random() < 0.5) {
        // Increased from 0.3 to 0.5 (50% chance)
        this.targetGlitchIntensity = Math.random() * 1.0 + 0.3; // Increased max from 0.8 to 1.0, min from 0.2 to 0.3
        setTimeout(() => {
          this.targetGlitchIntensity = 0;
        }, Math.random() * 400 + 150); // Increased duration: 150-550ms instead of 100-400ms
      }
    }, 1500 + Math.random() * 2000); // More frequent: every 1.5-3.5s instead of 2-5s
  }

  render() {
    this.time += 0.016;

    // Smooth glitch intensity transition
    this.glitchIntensity +=
      (this.targetGlitchIntensity - this.glitchIntensity) * 0.1;

    this.gl.clearColor(1, 1, 1, 1); // Changed from (0, 0, 0, 1) to white
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);

    if (!this.texture) {
      requestAnimationFrame(() => this.render());
      return;
    }

    this.gl.useProgram(this.program);

    // Bind buffer and set attributes
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);
    this.gl.enableVertexAttribArray(this.positionLocation);
    this.gl.vertexAttribPointer(
      this.positionLocation,
      2,
      this.gl.FLOAT,
      false,
      16,
      0
    );
    this.gl.enableVertexAttribArray(this.texCoordLocation);
    this.gl.vertexAttribPointer(
      this.texCoordLocation,
      2,
      this.gl.FLOAT,
      false,
      16,
      8
    );

    // Set uniforms (removed u_resolution from fragment shader)
    this.gl.uniform1f(this.timeLocation, this.time);
    this.gl.uniform1f(this.glitchLocation, this.glitchIntensity);
    this.gl.uniform2f(
      this.resolutionLocation,
      this.canvas.width,
      this.canvas.height
    );
    this.gl.uniform2f(
      this.imageSizeLocation,
      this.imageWidth,
      this.imageHeight
    ); // This was missing!

    // Bind texture
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
    this.gl.uniform1i(this.textureLocation, 0);

    // Draw
    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);

    requestAnimationFrame(() => this.render());
  }
}

// Initialize the effect when page loads
window.addEventListener("load", () => {
  new VHSGlitchEffect();
});
