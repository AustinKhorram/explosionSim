$(document).ready(function () {
    if (!Detector.webgl) {
        // Will not work unless browser supports WebGL
        Detector.addGetWebGLMessage();
        document.getElementById('container').innerHTML = "";
    }

    // Texture width for simulation -- 32 SEEMS OPTIMAL
    var WIDTH = 32;
    var NUM_TEXELS = WIDTH * WIDTH;

    // Size in system units
    var BOUNDS = WIDTH * 4;
    var BOUNDS_HALF = BOUNDS * 0.5;

    // Size in terms of number of vertices
    var SIZE = BOUNDS_HALF - 1;
    var HALF_SIZE = SIZE / 2;

    var container, stats;
    var camera, scene, renderer, controls;
    var mouseMoved = false;
    var mouseCoords = new THREE.Vector2();
    var raycaster = new THREE.Raycaster();

    var waterMesh;
    var sphereMesh;
    var boxMesh;
    var meshRay;

    var gpuCompute;
    var heightmapVariable;
    var waterUniforms;
    var smoothShader;

    var simplex = new SimplexNoise();

    var windowHalfX = window.innerWidth / 2;
    var windowHalfY = window.innerHeight / 2;

    var colors = []; // Need for gradient
    var colorsDefault;

    init();
    animate();

    /*
     * Initialize camera, scene, and inital renders.
     * Setup GUI, mouse interaction, initalize "water" and interactivity.
     */
    function init() {

        container = document.createElement( 'div' );
        document.body.appendChild( container );

        // Initalize Camera/Scene
        camera = new THREE.PerspectiveCamera( 80, window.innerWidth / window.innerHeight, 1, 3000 );
        camera.position.set( 0, 150, 0);
        scene = new THREE.Scene();

        // Lighting for our scene (we need this)
        var sun1 = new THREE.DirectionalLight( 0xFFFFFF, 1.0 );
        sun1.position.set( 100, 200, 100 );
        scene.add( sun1 );
        var sun2 = new THREE.DirectionalLight( 0xFFFFFF, 0.6 );
        sun2.position.set( -100, 200, -100 );
        scene.add( sun2 );

        // Render WebGL
        renderer = new THREE.WebGLRenderer();
        renderer.setPixelRatio( window.devicePixelRatio );
        renderer.setSize( window.innerWidth, window.innerHeight );
        container.appendChild( renderer.domElement );

        // Set controls for camera interaction
        controls = new THREE.OrbitControls( camera, renderer.domElement );

        // Adding events for user interactivity (I think)...
        document.addEventListener( 'mousemove', onDocumentMouseMove, false );
        document.addEventListener( 'touchstart', onDocumentTouchStart, false );
        document.addEventListener( 'touchmove', onDocumentTouchMove, false );

        // Toggle wireframe when key W is pressed.
        document.addEventListener( 'keydown', function( event ) {
            if ( event.keyCode === 87 ) {

                waterMesh.material.wireframe = ! waterMesh.material.wireframe;
                waterMesh.material.needsUpdate = true;

                boxMesh.material.wireframe = ! boxMesh.material.wireframe;
                sphereMesh.material.wireframe = ! sphereMesh.material.wireframe;
            }

        } , false );

        window.addEventListener( 'resize', onWindowResize, false );

        var gui = new dat.GUI();

        stats = new Stats();
        document.body.appendChild( stats.dom );

        var effectController = {
            mouseSize: 20.0,
            viscosity: 0.03,
            sphereRadius: 20,
            boxSide: 20
        };

        var valuesChanger = function() {

            heightmapVariable.material.uniforms.mouseSize.value = effectController.mouseSize;
            heightmapVariable.material.uniforms.viscosityConstant.value = effectController.viscosity;
        };
        var geometryChanger = function() {

            var newRadius = effectController.sphereRadius;
            sphereMesh.geometry = new THREE.SphereGeometry( newRadius, 32, 32 );

            var newSide = effectController.boxSide;
            boxMesh.geometry = new THREE.BoxGeometry( newSide, newSide, newSide );
        };

        gui.add( effectController, "mouseSize", 1.0, 100.0, 1.0 ).onChange( valuesChanger );
        gui.add( effectController, "viscosity", 0.0, 0.03, 0.001 ).onChange( valuesChanger );

        gui.add( effectController, "sphereRadius", 1.0, 100.0, 1.0 ).onChange( geometryChanger );
        gui.add( effectController, "boxSide", 1.0, 100.0, 1.0 ).onChange( geometryChanger );

        // Buttons for toggling the various propagations (temp, pressure, vel, density)
        var buttonSmooth = {
            SmoothField: function() {
                SmoothField();
            }
        };
        var buttonDensity = {
            DensityField: function() {
                DensityField();
            }
        };
        var buttonTemp = {
            TemperatureField: function() {
                TemperatureField();
            }
        };
        var buttonPres = {
            PressureField: function() {
                PressureField();
            }
        };
        var buttonVel = {
            VelocityField: function() {
                VelocityField();
            }
        };
        var buttonExplosion = {
            AddExplosion: function() {
                Explosion();
            }
        };
        var buttonSphere = {
            ToggleSphere: function() {
                sphereMesh.material.visible = ! sphereMesh.material.visible;
            }
        };
        var buttonBox = {
            ToggleBox: function() {
                boxMesh.material.visible = ! boxMesh.material.visible;
            }
        };

        // Add buttons to the GUI.
        gui.add( buttonSmooth, 'SmoothField' );
        gui.add( buttonDensity, 'DensityField' );
        gui.add( buttonVel, 'VelocityField' );
        gui.add( buttonPres, 'PressureField' );
        gui.add( buttonTemp, 'TemperatureField' );
        gui.add( buttonExplosion, 'AddExplosion' );
        gui.add( buttonSphere, 'ToggleSphere' );
        gui.add( buttonBox, 'ToggleBox' );

        initWater();

        initSphere();

        initBox();

        valuesChanger();
    }

    function initMaterial() {
        // material: make a ShaderMaterial clone of MeshPhongMaterial, with customized vertex shader
        var materialColor = 0xFFFFFF;

        var material = new THREE.ShaderMaterial( {
            uniforms: THREE.UniformsUtils.merge( [
                THREE.ShaderLib[ 'phong' ].uniforms,
                {
                    heightmap: { value: null }
                }
            ] ),
            vertexShader: document.getElementById( 'waterVertexShader' ).textContent,
            fragmentShader: THREE.ShaderChunk[ 'meshphong_frag' ],
            vertexColors: THREE.VertexColors

        } );

        material.lights = true;

        // Material attributes from MeshPhongMaterial
        material.color = new THREE.Color( materialColor );
        material.specular = new THREE.Color( 0x111111 );
        material.shininess = 0;

        // Sets the uniforms with the material values
        material.uniforms.diffuse.value = material.color;
        material.uniforms.specular.value = material.specular;
        material.uniforms.shininess.value = Math.max( material.shininess, 1e-4 );
        material.uniforms.opacity.value = material.opacity;

        // Defines
        material.defines.WIDTH = WIDTH.toFixed( 1 );
        material.defines.BOUNDS = BOUNDS.toFixed( 1 );

        return material;
    }

    function initWater() {

        var geometry = new THREE.PlaneBufferGeometry( BOUNDS, BOUNDS, WIDTH - 1, WIDTH - 1 );

        for ( var i = 0; i <= HALF_SIZE; i++ ) {
            var y = i - HALF_SIZE;

            for ( var j = 0; j <= HALF_SIZE; j++ ) {
                var x = j - HALF_SIZE;

                var r = ( x / SIZE ) + 0.5; // Test gradient
                var g = ( y / SIZE ) + 0.5;

                colors.push( r, g, 0.7 );
            }
        }

        // Add 'color' to possible attributes of geometry
        geometry.addAttribute( 'color', new THREE.Float32BufferAttribute( colors, 3 ) );
        geometry.getAttribute( 'color' ).setDynamic(true);
        colorsDefault = geometry.getAttribute( 'color' ).clone();

        // Water material
        var material = initMaterial();
        waterUniforms = material.uniforms;

        // Water mesh
        waterMesh = new THREE.Mesh( geometry, material );
        waterMesh.rotation.x = - Math.PI / 2;
        waterMesh.matrixAutoUpdate = false;
        waterMesh.updateMatrix();

        scene.add( waterMesh );


        // Mesh just for mouse raycasting
        var geometryRay = new THREE.PlaneBufferGeometry( BOUNDS, BOUNDS, 1, 1 );
        meshRay = new THREE.Mesh( geometryRay, new THREE.MeshBasicMaterial( { color: 0xFFFFFF, visible: false } ) );
        meshRay.rotation.x = - Math.PI / 2;
        meshRay.matrixAutoUpdate = false;
        meshRay.updateMatrix();
        scene.add( meshRay );


        // Creates the gpu computation class and sets it up
        gpuCompute = new GPUComputationRenderer( WIDTH, WIDTH, renderer );

        var heightmap0 = gpuCompute.createTexture();

        fillTexture( heightmap0 );

        heightmapVariable = gpuCompute.addVariable( "heightmap", document.getElementById( 'heightmapFragmentShader' ).textContent, heightmap0 );

        gpuCompute.setVariableDependencies( heightmapVariable, [ heightmapVariable ] );

        heightmapVariable.material.uniforms.mousePos = { value: new THREE.Vector2( 10000, 10000 ) };
        heightmapVariable.material.uniforms.mouseSize = { value: 20.0 };
        heightmapVariable.material.uniforms.viscosityConstant = { value: 0.03 };
        heightmapVariable.material.defines.BOUNDS = BOUNDS.toFixed( 1 );

        var error = gpuCompute.init();

        if ( error !== null ) {
            console.error( error );
        }

        // Create compute shader to smooth the water surface and velocity
        var heightmap_flat = gpuCompute.createTexture();
        smoothShader = gpuCompute.createShaderMaterial( document.getElementById( 'smoothFragmentShader' ).textContent, { texture: heightmap_flat } );
    }

    function initSphere() {

        var geometry = new THREE.SphereGeometry( 20, 32, 32 );
        var material = new THREE.MeshNormalMaterial();
        material.visible = false;

        sphereMesh = new THREE.Mesh( geometry, material );

        scene.add( sphereMesh );
    }

    function initBox() {

        var geometry = new THREE.BoxGeometry( 20, 20, 20 );
        var material = new THREE.MeshNormalMaterial();
        material.visible = false;

        boxMesh = new THREE.Mesh( geometry, material );

        scene.add( boxMesh );
    }

    function fillTexture( texture ) {

        var waterMaxHeight = 50;

        function noise( x, y, z ) {
            var multR = waterMaxHeight/25;
            var mult = 0.025;
            var r = 0;
            for ( var i = 0; i < 15; i++ ) {
                r += multR * simplex.noise( x * mult, y * mult );
                multR *= 0.53 + 0.025 * i;
                mult *= 1.25;
            }
            return r;
        }

        var pixels = texture.image.data;

        var p = 0;
        for ( var j = 0; j < WIDTH; j++ ) {
            for ( var i = 0; i < WIDTH; i++ ) {

                var x = i * 128 / WIDTH;
                var y = j * 128 / WIDTH;

                pixels[ p + 0 ] = noise( x, y, 123.4 );
                pixels[ p + 1 ] = 0;
                pixels[ p + 2 ] = 0;
                pixels[ p + 3 ] = 1;

                p += 4;
            }
        }
    }

    /*
     * Causes the Mesh to become stationary (eliminate all noise).
     */
    function SmoothField() {

        var texture = gpuCompute.createTexture(); // Should be flat by default
        var flatShader = gpuCompute.createShaderMaterial( document.getElementById( 'heightmapFragmentShader' ).textContent, { texture: texture } );

        var currentRenderTarget = gpuCompute.getCurrentRenderTarget( heightmapVariable );
        var alternateRenderTarget = gpuCompute.getAlternateRenderTarget( heightmapVariable );

        for ( var i = 0; i < 11; i++ ) {

            flatShader.uniforms.texture.value = currentRenderTarget.texture;
            gpuCompute.doRenderTarget( flatShader, alternateRenderTarget );

            flatShader.uniforms.texture.value = alternateRenderTarget.texture;
            gpuCompute.doRenderTarget( flatShader, currentRenderTarget );
        }
    }

    /*
     * Function to create an explosion in centre
     */
    function Explosion() {

        // Trying to create a texture with noise
        var texture_noise = gpuCompute.createTexture();
        fillTexture( texture_noise );

        // Using gpuCompute to create a shader (wtf is a shader) with that texture
        var noiseShader = gpuCompute.createShaderMaterial( document.getElementById( 'heightmapFragmentShader' ).textContent, { texture: texture_noise } );

        // Don't understand why we need two targets
        var currentRenderTarget = gpuCompute.getCurrentRenderTarget( heightmapVariable );
        var alternateRenderTarget = gpuCompute.getAlternateRenderTarget( heightmapVariable );

        for ( var i = 0; i < 1; i++ ) {
            // Trying to apply shader to material
            noiseShader.uniforms.texture.value = currentRenderTarget.texture;
            gpuCompute.doRenderTarget( noiseShader, alternateRenderTarget );

            noiseShader.uniforms.texture.value = alternateRenderTarget.texture;
            gpuCompute.doRenderTarget( noiseShader, currentRenderTarget );
        }
    }
    /*
     * Reset color gradient state to default
     */
    function DefaultField() {

        var meshColor = waterMesh.geometry.getAttribute('color');
        meshColor.needsUpdate = true;
        meshColor = colorsDefault;
    }
    /*
     * Maps DENSITY values to specific COLORS on the mesh.
     * GREEN = HIGH, BLUE = LOW (can change color schemes).
     */
    function DensityField() {

        var meshColor = waterMesh.geometry.getAttribute('color');
        meshColor.needsUpdate = true;

        // Update the colors gradient
        // i = index, TOP LEFT = 0, BOTTOM RIGHT = WIDTH^2 (32 x 32 = 1024).
        for ( var i = 0; i <= WIDTH*WIDTH; i++ ) {
            var magnitude = i/(WIDTH*WIDTH);
            // X = RED, Y = GREEN, Z = BLUE
            meshColor.setX(i, 0.5);
            meshColor.setY(i, magnitude);
            meshColor.setZ(i, magnitude);
        }
    }
    /*
     * Maps PRESSURE values to specific COLORS on the mesh
     * GREEN = HIGH, BLUE = LOW (can change color schemes).
     */
     function PressureField(pressureArray) {

       var meshColor = waterMesh.geometry.getAttribute('color');
       meshColor.needsUpdate = true;
       /*
       // Iterate through each PRESSURE value, map to a color, and write color to mesh.
       for( var i = 0; i <= WIDTH*WIDTH; i++ ) {
          var instPressure = pressureArray[i];
       }
       */
     }
    /*
     * Maps TEMPERATURE values to specific COLORS on the mesh.
     * RED = HIGH, BLUE = LOW (can change color schemes).
     */
    function TemperatureField() {

        var meshColor = waterMesh.geometry.getAttribute('color');
        meshColor.needsUpdate = true;

        // Keeps track of vertex index.
        // TOP LEFT = 0, BOTTOM RIGHT = WIDTH^2 (32 x 32 = 1024).
        for ( var i = 0; i <= WIDTH*WIDTH; i++ ) {
            var magnitude = i/(WIDTH*WIDTH);
            // X = RED, Y = GREEN, Z = BLUE
            meshColor.setY(i, 0.5);
            meshColor.setX(i, magnitude);
            meshColor.setZ(i, magnitude);
        }
    }
    /*
     * Maps VELOCITY values to specific COLORS on the mesh.
     * GREEN = HIGH, BLUE = LOW (can change color schemes).
     */
    function VelocityField() {

        var meshColor = waterMesh.geometry.getAttribute('color');
        meshColor.needsUpdate = true;

        for ( var i = 0; i <= WIDTH*WIDTH; i++ ) {
            var magnitude = i/(WIDTH*WIDTH);
            // X = RED, Y = GREEN, Z = BLUE
            meshColor.setZ(i, 0.5);
            meshColor.setX(i, magnitude);
            meshColor.setY(i, magnitude);
        }
    }


    // need to add comments for rest of the functions below.
    function onWindowResize() {

        windowHalfX = window.innerWidth / 2;
        windowHalfY = window.innerHeight / 2;

        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();

        renderer.setSize( window.innerWidth, window.innerHeight );
    }

    function setMouseCoords( x, y ) {

        mouseCoords.set( ( x / renderer.domElement.clientWidth ) * 2 - 1, - ( y / renderer.domElement.clientHeight ) * 2 + 1 );
        mouseMoved = true;
    }

    function onDocumentMouseMove( event ) {

        setMouseCoords( event.clientX, event.clientY );
    }

    function onDocumentTouchStart( event ) {

        if ( event.touches.length === 1 ) {

            event.preventDefault();
            setMouseCoords( event.touches[ 0 ].pageX, event.touches[ 0 ].pageY );
        }
    }

    function onDocumentTouchMove( event ) {

        if ( event.touches.length === 1 ) {

            event.preventDefault();
            setMouseCoords( event.touches[ 0 ].pageX, event.touches[ 0 ].pageY );
        }
    }

    function animate() {

        requestAnimationFrame( animate );
        render();
        stats.update();
    }

    function render() {

        // Set uniforms: mouse interaction
        var uniforms = heightmapVariable.material.uniforms;
        /*
        if ( mouseMoved ) {

            this.raycaster.setFromCamera( mouseCoords, camera );

            var intersects = this.raycaster.intersectObject( meshRay );

            if ( intersects.length > 0 ) {
                var point = intersects[ 0 ].point;
                uniforms.mousePos.value.set( point.x, point.z );

            }
            else {
                uniforms.mousePos.value.set( 10000, 10000 );
            }

            mouseMoved = false;
        }
        else {
            uniforms.mousePos.value.set( 10000, 10000 );
        }
        */

        // Do the gpu computation
        gpuCompute.compute();

        // Get compute output in custom uniform
        waterUniforms.heightmap.value = gpuCompute.getCurrentRenderTarget( heightmapVariable ).texture;

        // Render
        renderer.render( scene, camera );
    }

   /*
    * INPUT: density (for a single vertex), maximum density, ambient density.
    *
    * REDDER = HIGH DENSITY, BLUER = LOW DENSITY.
    * densityMax and densityAir are taken as parameters but can be removed if we define
    * them as global constants at some point. For now they are arbitrary.
    *
    * RETURN: array containing RGB in [0], [1], [2]. Values between 0 and 2.
    */
    function getColour( density, densityMax, densityAir ) {
      // range is between (airDensity and densityMax)
      var densityRange = (densityMax - densityAir);
      var densityHalf = ( (densityMax + densityAir) / 2);

      var returnColor = [];

      // Colour initializations
      var red = 0;
      var green = 0;
      var blue = 0;

      // Computes values for red and blue
      // VALUES SHOULD BE BETWEEN 0 AND 2(?).
      if( density >= densityAir && density <= densityHalf ) {
        blue = 2;
        // degree of "greenness" is increased in proportion to magnitude of density within given bounds.
        green = 2 * ( ( density - densityAir ) / ( densityMax / 2 - densityAir ) );

      } else if( density > densityHalf && density <= densityMax ) {
        green = 2;
        // degree of "blueness" decreased in proportion to magnitude of density within given bounds.
        blue = 2 * ( (densityMax - density) / (densityMax - densityHalf) );

      } else if ( density > densityMax ) {
        green = 2;
        blue = 0;
      }

      returnColor[0] = red;
      returnColor[1] = green;
      returnColor[2] = blue;

      return returnColor;

      // MIGHT NOT NEED THIS
      // // Convert to hexadecimal
      // var redHex = rgbToHex( red );
      // var greenHex = rgbToHex( green );
      // var blueHex = rgbToHex( blue );
      //
      // // concatenate the colour strings.
      // var colour = redHex.concat( greenHex, blueHex );
      //
      // // colour is in the form 0x000000 (hopefully)...
      // return colour;
    }

    // Helper function for getColour. Works for 0 < rgb < 255.
    // MIGHT NOT NEED THIS, COMMENTED OUT FOR NOW.
    // var rgbToHex = function (rgb) {
    //   var hex = Number(rgb).toString(16);
    //   if (hex.length < 2) {
    //     hex = "0" + hex;
    //   }
    //   return hex;
    // };

});
