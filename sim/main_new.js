$(document).ready(function ( {
    if (!Detector.webgl ) {

        Detector.addGetWebGLMessage();
        document.getElementById( 'container' ).innerHTML = "";
    }

    document.getElementById( 'waterSize' ).innerText = WIDTH + ' x ' + WIDTH;

    var hash = document.location.hash.substr( 1 );
    if ( hash )
        hash = parseInt( hash, 0 );

    var camera, scene, render, stats;
    var mesh;

    var windowW = window.innerWidth;
    var windowH = window.innerHeight;

    init();
    animate();

    function init() {

        camera = new THREE.PerspectiveCamera( 27, windowW/windowH, 1, 3000 );
        camera.position.z = 64;

        scene = new THREE.Scene();
        scene.background = new THREE.Color( 0x050505 );

        var ambientLight = new THREE.AmbientLight ( 0xAAAAAA );
        scene.add( ambientLight );

        var light1 = new THREE.DirectionalLight( 0xffffff, 0.5 );
		light1.position.set( 1, 1, 1 );
		scene.add( light1 );

		var light2 = new THREE.DirectionalLight( 0xffffff, 1 );
		light2.position.set( 0, - 1, 0 );
		scene.add( light2 );

        // Add directional lights if required

        var geometry = new THREE.BufferGeometry();

        var indices = [];
        var vertices = [];
        var normals = [];
        var colors = [];

        var SIZE = 128; // Number of vertices in geometry
        var SEGMENTS = SIZE /2; // Number of segments in geometry

        for ( var i = 0; i <= SEGMENTS; i++ ) {

            var y = i - halfSize;

            for (var j = 0; j <= SEGMENTS; j++ ) {

                var x = j - halfSize;

                vertices.push( x, -y, 0 ); // (x,y,z) position
                normals.push( 0, 0, 1 );

                var r = (x / SIZE ) + 0.5;
                var g = (y / SIZE ) + 0.5;

                colors.push( r, g, 1 );
            }
        }

        for (var i = 0; i < SEGMENTS; i++ ) {

            for ( var j = 0; j < SEGMENTS; j++ ) {

                var a = (i + 1) + j * (SEGMENTS + 1);
                var b = i + j * (SEGMENTS + 1);
                var c = (j + 1) * (SEGMENTS + 1) + i;
                var d = (j + 1) * (SEGMENTS + 1) + (i + 1);

                // Generate two faces

                indices.push( a, b, d );
                indices.push( b, c, d );
            }
        }
    }

    geometry.setIndex( indices );
    geometry.addAttribute( 'position', new THREE.Float32BufferAttribute( vertices, 3 ) );
	geometry.addAttribute( 'normal', new THREE.Float32BufferAttribute( normals, 3 ) );
	geometry.addAttribute( 'color', new THREE.Float32BufferAttribute( colors, 3 ) );

    var material = new THREE.MeshPhongMaterial( {
        specular: 0xAAAAAA, shininess: 250,
        side: THREE.DoubleSide, vertexColors: THREE.VertexColors
    } );

    mesh = new THREE.Mesh( geometry, material );
    scene.add( mesh );

    renderer = new THREE.WebGLRenderer( );
    renderer.setPixelRatio( window.devicePixelRatio );
    renderer.setSize( windowW, windowH );
    dovument.body.appendChild( renderer.domElement );

    controls = new THREE.OrbitControls( camera, renderer.domElement );
    document.addEventListener( 'mousemove', onDocumentMouseMove, false );
    document.addEventListener( 'touchstart', onDocumentTouchStart, false );
    document.addEventListener( 'touchmove', onDocumentTouchMove, false );

    stats = new Stats();
    document.body.appendChild( stats.dom );

    var gui = new dat.GUI();
    gui.add( material, 'wireframe' );

    window.addEventListener( 'resize', onWindowResize, false );

}

function onWindowResize() {

    camera.aspect = windowW / windowH;
    camera.updateProjectionMatrix();
    renderer.setSize( windowW, windowH );
}

function animate() {

    requestAnimationFrame( animate );
    render();
    stats.update();
}

function render() {

    var time = Date.now() * 0.001;
    renderer.render( scene, camera );
}
