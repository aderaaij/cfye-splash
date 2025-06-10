import GUI from "lil-gui";

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
    this.imageWidth = 512;
    this.imageHeight = 512;
    this.glitchInterval = null;

    // GUI parameters
    this.params = {
      // Glitch controls
      glitchFrequency: 0.5, // How often glitches occur (0-1)
      glitchDuration: 300, // How long glitches last (ms)
      maxGlitchIntensity: 1.0, // Maximum glitch strength
      minGlitchIntensity: 0.3, // Minimum glitch strength

      // Scanline controls
      scanlineSpeed: 0.15, // Speed of moving scanlines
      scanlineIntensity: 0.04, // Strength of scanline effect
      thickScanlineSpeed: 0.03, // Speed of thick scanlines
      thickScanlineIntensity: 0.02, // Strength of thick scanlines
      scanlineGlitchThreshold: 0.98, // How rare scanline glitches are (0.9-0.999)

      // Distortion controls
      horizontalDistortion: 0.1, // Horizontal noise distortion
      verticalGlitchBars: 0.2, // Vertical glitch bar intensity
      rgbShiftIntensity: 1.0, // RGB channel separation

      // Visual effects
      colorGradeR: 1.1, // Red channel multiplier
      colorGradeG: 0.95, // Green channel multiplier
      colorGradeB: 0.9, // Blue channel multiplier
      noiseIntensity: 0.05, // Film grain amount
      vignetteStrength: 0.3, // Vignette darkness

      // Image scaling
      imageScale: 0.8, // How big the image appears (0.1-2.0)

      // Animation
      pause: false, // Pause animation
      resetGlitch: () => this.triggerGlitch(), // Manual glitch trigger
    };

    this.init();
    this.createGUI();
  }

  init() {
    if (!this.gl) {
      console.error("WebGL not supported");
      document.querySelector(".loading").textContent =
        "WebGL not supported in this browser";
      return;
    }

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
  }

  createShaders() {
    const vertexShaderSource = `
      attribute vec2 a_position;
      attribute vec2 a_texCoord;
      uniform vec2 u_resolution;
      uniform vec2 u_imageSize;
      uniform float u_imageScale;
      varying vec2 v_texCoord;
      
      void main() {
          float screenAspect = u_resolution.x / u_resolution.y;
          float imageAspect = u_imageSize.x / u_imageSize.y;
          
          vec2 scale = vec2(1.0);
          if (imageAspect > screenAspect) {
              scale.y = screenAspect / imageAspect;
          } else {
              scale.x = imageAspect / screenAspect;
          }
          
          scale *= u_imageScale;
          
          gl_Position = vec4(a_position * scale, 0.0, 1.0);
          v_texCoord = a_texCoord;
      }
    `;

    const fragmentShaderSource = `
      precision mediump float;
      uniform sampler2D u_texture;
      uniform float u_time;
      uniform float u_glitchIntensity;
      
      // Scanline uniforms
      uniform float u_scanlineSpeed;
      uniform float u_scanlineIntensity;
      uniform float u_thickScanlineSpeed;
      uniform float u_thickScanlineIntensity;
      uniform float u_scanlineGlitchThreshold;
      
      // Distortion uniforms
      uniform float u_horizontalDistortion;
      uniform float u_verticalGlitchBars;
      uniform float u_rgbShiftIntensity;
      
      // Visual effect uniforms
      uniform vec3 u_colorGrade;
      uniform float u_noiseIntensity;
      uniform float u_vignetteStrength;
      
      varying vec2 v_texCoord;

      float random(vec2 st) {
          return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
      }

      vec3 rgbShift(sampler2D tex, vec2 uv, float intensity) {
          float shift = intensity * u_rgbShiftIntensity * 0.01;
          float r = texture2D(tex, uv + vec2(shift, 0.0)).r;
          float g = texture2D(tex, uv).g;
          float b = texture2D(tex, uv - vec2(shift, 0.0)).b;
          return vec3(r, g, b);
      }

      void main() {
          vec2 uv = v_texCoord;
          
          // Moving VHS scanlines
          float scanlineOffset = u_time * u_scanlineSpeed;
          float scanlineY = uv.y + scanlineOffset;
          float scanline = sin(scanlineY * 800.0) * u_scanlineIntensity;
          
          // Glitching scanlines
          float scanlineGlitch = random(vec2(floor(scanlineY * 100.0), floor(u_time * 5.0)));
          if (scanlineGlitch > u_scanlineGlitchThreshold) {
              scanline *= 2.0;
          }
          
          // Thick scanline bands
          float thickScanline = sin((scanlineY + u_time * u_thickScanlineSpeed) * 50.0) * u_thickScanlineIntensity;
          scanline += thickScanline;
          
          // Horizontal distortion
          float noise = random(vec2(floor(uv.y * 150.0), floor(u_time * 10.0)));
          float distortion = (noise - 0.5) * u_glitchIntensity * u_horizontalDistortion;
          
          // Scanline-based distortion
          float scanlineDistort = step(0.985, random(vec2(floor(scanlineY * 200.0), floor(u_time * 8.0))));
          distortion += scanlineDistort * (noise - 0.5) * 0.03;
          
          uv.x += distortion;
          
          // Vertical glitch bars
          float glitchBar = step(0.98, random(vec2(floor(uv.y * 25.0), floor(u_time * 15.0))));
          uv.x += glitchBar * (noise - 0.5) * u_glitchIntensity * u_verticalGlitchBars;
          
          // RGB shift
          vec3 color = rgbShift(u_texture, uv, u_glitchIntensity);
          
          // Add moving scanlines
          color -= scanline;
          
          // Scanline color bleeding
          if (scanlineGlitch > u_scanlineGlitchThreshold) {
              color.r += 0.06;
              color.g -= 0.03;
          }
          
          // VHS color grading
          color *= u_colorGrade;
          
          // Add noise
          float grain = random(uv + u_time) * u_noiseIntensity;
          color += grain;
          
          // Vignette effect
          vec2 center = uv - 0.5;
          float vignette = 1.0 - dot(center, center) * u_vignetteStrength;
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
      return;
    }

    this.setupBuffers();
    this.getUniformLocations();
  }

  getUniformLocations() {
    this.uniforms = {
      time: this.gl.getUniformLocation(this.program, "u_time"),
      glitchIntensity: this.gl.getUniformLocation(
        this.program,
        "u_glitchIntensity"
      ),
      resolution: this.gl.getUniformLocation(this.program, "u_resolution"),
      imageSize: this.gl.getUniformLocation(this.program, "u_imageSize"),
      imageScale: this.gl.getUniformLocation(this.program, "u_imageScale"),
      texture: this.gl.getUniformLocation(this.program, "u_texture"),

      // Scanline uniforms
      scanlineSpeed: this.gl.getUniformLocation(
        this.program,
        "u_scanlineSpeed"
      ),
      scanlineIntensity: this.gl.getUniformLocation(
        this.program,
        "u_scanlineIntensity"
      ),
      thickScanlineSpeed: this.gl.getUniformLocation(
        this.program,
        "u_thickScanlineSpeed"
      ),
      thickScanlineIntensity: this.gl.getUniformLocation(
        this.program,
        "u_thickScanlineIntensity"
      ),
      scanlineGlitchThreshold: this.gl.getUniformLocation(
        this.program,
        "u_scanlineGlitchThreshold"
      ),

      // Distortion uniforms
      horizontalDistortion: this.gl.getUniformLocation(
        this.program,
        "u_horizontalDistortion"
      ),
      verticalGlitchBars: this.gl.getUniformLocation(
        this.program,
        "u_verticalGlitchBars"
      ),
      rgbShiftIntensity: this.gl.getUniformLocation(
        this.program,
        "u_rgbShiftIntensity"
      ),

      // Visual effect uniforms
      colorGrade: this.gl.getUniformLocation(this.program, "u_colorGrade"),
      noiseIntensity: this.gl.getUniformLocation(
        this.program,
        "u_noiseIntensity"
      ),
      vignetteStrength: this.gl.getUniformLocation(
        this.program,
        "u_vignetteStrength"
      ),
    };

    this.attributes = {
      position: this.gl.getAttribLocation(this.program, "a_position"),
      texCoord: this.gl.getAttribLocation(this.program, "a_texCoord"),
    };
  }

  createShader(type, source) {
    const shader = this.gl.createShader(type);
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);

    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      const error = this.gl.getShaderInfoLog(shader);
      console.error("Shader compile error:", error);
      this.gl.deleteShader(shader);
      return null;
    }

    return shader;
  }

  setupBuffers() {
    const vertices = new Float32Array([
      -1, -1, 0, 1, 1, -1, 1, 1, -1, 1, 0, 0, 1, 1, 1, 0,
    ]);

    this.buffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);
  }

  loadLogo() {
    const img = new Image();
    img.onload = () => {
      this.imageWidth = img.width;
      this.imageHeight = img.height;
      this.createTextureFromImage(img);
      document.querySelector(".loading").style.display = "none";
    };
    img.onerror = () => {
      console.error("Failed to load logo");
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
    const scheduleNextGlitch = () => {
      const baseInterval = 2000; // 2 seconds
      const randomInterval = Math.random() * 3000; // 0-3 seconds
      const frequency = this.params.glitchFrequency;
      const interval = baseInterval + randomInterval * (1 - frequency);

      this.glitchInterval = setTimeout(() => {
        if (Math.random() < frequency) {
          this.triggerGlitch();
        }
        scheduleNextGlitch();
      }, interval);
    };

    scheduleNextGlitch();
  }

  triggerGlitch() {
    const intensity =
      Math.random() *
        (this.params.maxGlitchIntensity - this.params.minGlitchIntensity) +
      this.params.minGlitchIntensity;
    this.targetGlitchIntensity = intensity;

    setTimeout(() => {
      this.targetGlitchIntensity = 0;
    }, this.params.glitchDuration);
  }

  createGUI() {
    const gui = new GUI({ closeFolders: true });
    gui.hide();
    window.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        this.params.resetGlitch();
      }
      if (event.key === "h") {
        gui._hidden ? gui.show() : gui.hide();
      }
    });
    gui.title("VHS Glitch Controls");

    // Glitch folder
    const glitchFolder = gui.addFolder("Glitch Settings");
    glitchFolder
      .add(this.params, "glitchFrequency", 0, 1, 0.1)
      .name("Frequency");
    glitchFolder
      .add(this.params, "glitchDuration", 50, 1000, 50)
      .name("Duration (ms)");
    glitchFolder
      .add(this.params, "maxGlitchIntensity", 0.1, 2.0, 0.1)
      .name("Max Intensity");
    glitchFolder
      .add(this.params, "minGlitchIntensity", 0.0, 1.0, 0.1)
      .name("Min Intensity");
    glitchFolder.add(this.params, "resetGlitch").name("Trigger Glitch");

    // Scanline folder
    const scanlineFolder = gui.addFolder("Scanlines");
    scanlineFolder
      .add(this.params, "scanlineSpeed", 0, 0.5, 0.01)
      .name("Speed");
    scanlineFolder
      .add(this.params, "scanlineIntensity", 0, 0.1, 0.001)
      .name("Intensity");
    scanlineFolder
      .add(this.params, "thickScanlineSpeed", 0, 0.1, 0.001)
      .name("Thick Speed");
    scanlineFolder
      .add(this.params, "thickScanlineIntensity", 0, 0.05, 0.001)
      .name("Thick Intensity");
    scanlineFolder
      .add(this.params, "scanlineGlitchThreshold", 0.9, 0.999, 0.001)
      .name("Glitch Threshold");

    // Distortion folder
    const distortionFolder = gui.addFolder("Distortion");
    distortionFolder
      .add(this.params, "horizontalDistortion", 0, 0.5, 0.01)
      .name("Horizontal");
    distortionFolder
      .add(this.params, "verticalGlitchBars", 0, 0.5, 0.01)
      .name("Vertical Bars");
    distortionFolder
      .add(this.params, "rgbShiftIntensity", 0, 3.0, 0.1)
      .name("RGB Shift");

    // Visual effects folder
    const visualFolder = gui.addFolder("Visual Effects");
    visualFolder
      .add(this.params, "colorGradeR", 0.5, 1.5, 0.01)
      .name("Red Channel");
    visualFolder
      .add(this.params, "colorGradeG", 0.5, 1.5, 0.01)
      .name("Green Channel");
    visualFolder
      .add(this.params, "colorGradeB", 0.5, 1.5, 0.01)
      .name("Blue Channel");
    visualFolder
      .add(this.params, "noiseIntensity", 0, 0.2, 0.001)
      .name("Film Grain");
    visualFolder
      .add(this.params, "vignetteStrength", 0, 1.0, 0.01)
      .name("Vignette");
    visualFolder
      .add(this.params, "imageScale", 0.1, 2.0, 0.1)
      .name("Image Scale");

    // Animation folder
    const animationFolder = gui.addFolder("Animation");
    animationFolder.add(this.params, "pause").name("Pause Animation");

    // Open some folders by default
    glitchFolder.show();
    scanlineFolder.show();
  }

  render() {
    if (!this.params.pause) {
      this.time += 0.016;
    }

    // Smooth glitch intensity transition
    this.glitchIntensity +=
      (this.targetGlitchIntensity - this.glitchIntensity) * 0.1;

    this.gl.clearColor(1, 1, 1, 1);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);

    if (!this.texture) {
      requestAnimationFrame(() => this.render());
      return;
    }

    this.gl.useProgram(this.program);

    // Bind buffer and set attributes
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);
    this.gl.enableVertexAttribArray(this.attributes.position);
    this.gl.vertexAttribPointer(
      this.attributes.position,
      2,
      this.gl.FLOAT,
      false,
      16,
      0
    );
    this.gl.enableVertexAttribArray(this.attributes.texCoord);
    this.gl.vertexAttribPointer(
      this.attributes.texCoord,
      2,
      this.gl.FLOAT,
      false,
      16,
      8
    );

    // Set all uniforms
    this.gl.uniform1f(this.uniforms.time, this.time);
    this.gl.uniform1f(this.uniforms.glitchIntensity, this.glitchIntensity);
    this.gl.uniform2f(
      this.uniforms.resolution,
      this.canvas.width,
      this.canvas.height
    );
    this.gl.uniform2f(
      this.uniforms.imageSize,
      this.imageWidth,
      this.imageHeight
    );
    this.gl.uniform1f(this.uniforms.imageScale, this.params.imageScale);

    // Scanline uniforms
    this.gl.uniform1f(this.uniforms.scanlineSpeed, this.params.scanlineSpeed);
    this.gl.uniform1f(
      this.uniforms.scanlineIntensity,
      this.params.scanlineIntensity
    );
    this.gl.uniform1f(
      this.uniforms.thickScanlineSpeed,
      this.params.thickScanlineSpeed
    );
    this.gl.uniform1f(
      this.uniforms.thickScanlineIntensity,
      this.params.thickScanlineIntensity
    );
    this.gl.uniform1f(
      this.uniforms.scanlineGlitchThreshold,
      this.params.scanlineGlitchThreshold
    );

    // Distortion uniforms
    this.gl.uniform1f(
      this.uniforms.horizontalDistortion,
      this.params.horizontalDistortion
    );
    this.gl.uniform1f(
      this.uniforms.verticalGlitchBars,
      this.params.verticalGlitchBars
    );
    this.gl.uniform1f(
      this.uniforms.rgbShiftIntensity,
      this.params.rgbShiftIntensity
    );

    // Visual effect uniforms
    this.gl.uniform3f(
      this.uniforms.colorGrade,
      this.params.colorGradeR,
      this.params.colorGradeG,
      this.params.colorGradeB
    );
    this.gl.uniform1f(this.uniforms.noiseIntensity, this.params.noiseIntensity);
    this.gl.uniform1f(
      this.uniforms.vignetteStrength,
      this.params.vignetteStrength
    );

    // Bind texture
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
    this.gl.uniform1i(this.uniforms.texture, 0);

    // Draw
    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);

    requestAnimationFrame(() => this.render());
  }
}

// Initialize when page loads
window.addEventListener("load", () => {
  new VHSGlitchEffect();
});
