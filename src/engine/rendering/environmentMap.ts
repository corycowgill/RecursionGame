import * as THREE from 'three';

/**
 * Custom PMREM environment for metal reflections: a gradient dome (deep navy above, teal horizon band,
 * dark floor) with warm strip lights on one side and a large cool window panel on the other. Gives brass a
 * warm/cool split highlight that matches the chamber lighting instead of RoomEnvironment's neutral grey.
 */
export function createEnvironmentTexture(renderer: THREE.WebGLRenderer): THREE.Texture {
  const scene = new THREE.Scene();
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(50, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {},
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} ',
      fragmentShader: /* glsl */ `
        varying vec3 vP;
        void main() {
          float y = vP.y;
          vec3 top = vec3(0.05, 0.09, 0.16);
          vec3 hor = vec3(0.22, 0.45, 0.6);
          vec3 bot = vec3(0.05, 0.04, 0.035);
          vec3 c = mix(hor, top, smoothstep(0.0, 0.7, y));
          c = mix(c, bot, smoothstep(0.0, -0.25, y));
          c += vec3(0.9, 0.55, 0.25) * pow(max(dot(vP, normalize(vec3(-0.7, 0.2, 0.5))), 0.0), 8.0) * 0.8;
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  );
  scene.add(dome);
  const warm = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb368).multiplyScalar(6) });
  const cool = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7cc8ff).multiplyScalar(3) });
  const strip = new THREE.BoxGeometry(1, 0.3, 14);
  for (const z of [-6, 0, 6]) {
    const s = new THREE.Mesh(strip, warm);
    s.position.set(-18, 10 + z * 0.3, z);
    s.rotation.z = 0.4;
    scene.add(s);
  }
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(26, 12), cool);
  panel.position.set(16, 8, -18);
  panel.lookAt(0, 4, 0);
  scene.add(panel);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff0dd).multiplyScalar(2.2) }));
  top.position.set(0, 24, 0);
  top.rotation.x = Math.PI / 2;
  scene.add(top);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(scene, 0.035);
  pmrem.dispose();
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  });
  return rt.texture;
}
