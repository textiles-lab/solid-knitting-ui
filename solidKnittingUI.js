if ( ! Detector.webgl ) Detector.addGetWebGLMessage();

			var container;
			var camera, scene, renderer;
			var projector, plane, cube;
			var mouse2D, mouse3D, raycaster,
			rollOveredFace, isShiftDown = false,
			theta = 45 * 0.5, isCtrlDown = false,
            omega = 45 * 0.5;
            var typepicked = 0; 

			var rollOverMesh, rollOverMaterial;
			var voxelPosition = new THREE.Vector3(), tmpVec = new THREE.Vector3(), normalMatrix = new THREE.Matrix3();
			var cubeGeo, cubeMaterial, cubeMaterialType, cubeTexture;
			var i, intersector;
            var types = [0xfcba03, 0xb6fc03, 0x1cfc03, 0x03fcf4, 0x0362fc, 0x4607f2, 0xb307f2, 0xf20798, 0xe60b16, 0x000000];
			init();
			animate();

			function init() {

				container = document.createElement( 'div' );
				document.body.appendChild( container );

				var info = document.createElement( 'div' );
				info.style.position = 'absolute';
				info.style.top = '10px';
                info.style.left = '10px';
				info.style.width = '100%';
				info.innerHTML = '<strong>Solid Knitting Web UI</strong><br><strong>click</strong>: add block<br><strong>control + click</strong>: remove block<br> <strong>shift + click</strong>: rotate<br> <strong> 0 - 9 </strong>: change block type';
				container.appendChild( info );

				camera = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 1, 10000 );
                raycaster = new THREE.Raycaster();
                
				camera.position.y = 800;

				scene = new THREE.Scene();

				// roll-over helpers
				const points = []
				rollOverGeo = new THREE.BoxGeometry( 50, 50, 50 );
				rollOverMaterial = new THREE.MeshBasicMaterial( { color: 0xff0000, opacity: 0.5, transparent: true } );
				rollOverMesh = new THREE.Mesh( rollOverGeo, rollOverMaterial );
				//scene.add( rollOverMesh );

				cubeGeo = new THREE.BoxGeometry( 50, 50, 50 );
                cubeMaterialType = [new THREE.MeshStandardMaterial( { color: types[0], opacity: 0.5, transparent: true } ),
                                    new THREE.MeshStandardMaterial( { color: types[1], opacity: 0.5, transparent: true } ),
                                    new THREE.MeshStandardMaterial( { color: types[2], opacity: 0.5, transparent: true } ),
                                    new THREE.MeshStandardMaterial( { color: types[3], opacity: 0.5, transparent: true } ),
                                    new THREE.MeshStandardMaterial( { color: types[4], opacity: 0.5, transparent: true } ),
                                    new THREE.MeshStandardMaterial( { color: types[5], opacity: 0.5, transparent: true } ),
                                    new THREE.MeshStandardMaterial( { color: types[6], opacity: 0.5, transparent: true } ),
                                    new THREE.MeshStandardMaterial( { color: types[7], opacity: 0.5, transparent: true } ),
                                    new THREE.MeshStandardMaterial( { color: types[8], opacity: 0.5, transparent: true } ),
                                    new THREE.MeshStandardMaterial( { color: types[9], opacity: 0.5, transparent: true } )];
                
                
                cubeMaterial = pickCube(typepicked);

				// picking
				projector = new THREE.Projector();

				// grid

				var size = 2000, step = 40;

				plane = new THREE.Mesh( new THREE.PlaneGeometry( 2000, 2000 ), new THREE.MeshBasicMaterial() );
				plane.rotation.x = - Math.PI / 2;
				plane.visible = false;
				scene.add( plane );

                const gridHelper = new THREE.GridHelper( size, step );
                scene.add( gridHelper )
                
				mouse2D = new THREE.Vector3( 0, 10000, 0.5 );

				// Lights

				var ambientLight = new THREE.AmbientLight( 0x606060 );
				scene.add( ambientLight );

				var directionalLight = new THREE.DirectionalLight( 0xffffff );
				directionalLight.position.set( 1, 0.75, 0.5 ).normalize();
				scene.add( directionalLight );

				renderer = new THREE.WebGLRenderer( { antialias: true } );
				renderer.setClearColor( 0xf0f0f0 );
				renderer.setSize( window.innerWidth, window.innerHeight );

				container.appendChild( renderer.domElement );

				document.addEventListener( 'mousemove', onDocumentMouseMove, false );
				document.addEventListener( 'mousedown', onDocumentMouseDown, false );
				document.addEventListener( 'keydown', onDocumentKeyDown, false );
				document.addEventListener( 'keyup', onDocumentKeyUp, false );

				//

				window.addEventListener( 'resize', onWindowResize, false );

			}

			function onWindowResize() {

				camera.aspect = window.innerWidth / window.innerHeight;
				camera.updateProjectionMatrix();

				renderer.setSize( window.innerWidth, window.innerHeight );

			}

			function getRealIntersector( intersects ) {
                for( i = 0; i < intersects.length; i++ ) {

					intersector = intersects[ i ];

					if ( intersector.object != rollOverMesh ) {

						return intersector;

					}

				}

				return null;

			}

			function setVoxelPosition( intersector ) {
                
                console.log(intersector);
                console.log(intersector.face);
				normalMatrix.getNormalMatrix( intersector.object.matrixWorld );

				tmpVec.copy( intersector.face.normal);
				tmpVec.applyMatrix3( normalMatrix ).normalize();

				voxelPosition.addVectors( intersector.point, tmpVec );

				voxelPosition.x = Math.floor( voxelPosition.x / 50 ) * 50 + 25;
				voxelPosition.y = Math.floor( voxelPosition.y / 50 ) * 50 + 25;
				voxelPosition.z = Math.floor( voxelPosition.z / 50 ) * 50 + 25;

			}
			

			function onDocumentMouseMove( event ) {

				event.preventDefault();

				mouse2D.x = ( event.clientX / window.innerWidth ) * 2 - 1;
				mouse2D.y = - ( event.clientY / window.innerHeight ) * 2 + 1;

			}

			function onDocumentMouseDown( event ) {

				event.preventDefault();

				var intersects = raycaster.intersectObjects( scene.children, true );

				if ( intersects.length > 0 ) {

					intersector = getRealIntersector( intersects );

					// delete cube

					if ( isCtrlDown ) {

						if ( intersector.object != plane ) {

							scene.remove( intersector.object );

						}

					// create cube

					} else {

						intersector = getRealIntersector( intersects );
						setVoxelPosition( intersector );
                        cubeMaterial = pickCube(typepicked);
						var voxel = new THREE.Mesh( cubeGeo, cubeMaterial );
						voxel.position.copy( voxelPosition );
						voxel.matrixAutoUpdate = false;
						voxel.updateMatrix();
						scene.add( voxel );

					}

				}
			}

			function onDocumentKeyDown( event ) {

				switch( event.keyCode ) {

					case 16: isShiftDown = true; break;
					case 17: isCtrlDown = true; break;
                    case 48: typepicked = 0; break;
                    case 49: typepicked = 1; break;
                    case 50: typepicked = 2; break;
                    case 51: typepicked = 3; break;
                    case 52: typepicked = 4; break;
                    case 53: typepicked = 5; break;
                    case 54: typepicked = 6; break;
                    case 55: typepicked = 7; break;
                    case 56: typepicked = 8; break;
                    case 57: typepicked = 9; break;

				}

			}

			function onDocumentKeyUp( event ) {

				switch ( event.keyCode ) {

					case 16: isShiftDown = false; break;
					case 17: isCtrlDown = false; break;

				}

			}

            function pickCube ( type ) {
                return cubeMaterialType[type];
            }

			//

			function animate() {

				requestAnimationFrame( animate );
				render();
			}

			function render() {

				if ( isShiftDown ) {

					theta += mouse2D.x * 1.5;
                    omega += mouse2D.y * 1.5;

				}
				var vector = mouse2D.clone().unproject( camera );
				raycaster.set( camera.position, vector.sub( camera.position ).normalize() );
				var intersects = raycaster.intersectObjects( scene.children , true);

				if ( intersects.length > 0 ) {

					intersector = getRealIntersector( intersects );
					if ( intersector ) {

						setVoxelPosition( intersector );
						// rollOverMesh.position = voxelPosition;

					}

				}

				camera.position.x = 1400 * Math.sin( THREE.MathUtils.degToRad( theta ) );
				camera.position.z = 1400 * Math.cos( THREE.MathUtils.degToRad( omega ) );

				camera.lookAt( scene.position );

				renderer.render( scene, camera );

			}