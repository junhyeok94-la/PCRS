'use client';

import React, { useRef, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';

interface ThermalAvatarProps {
  gender: 'male' | 'female';
  avatarState: 'sweating' | 'hot' | 'slightly_hot' | 'comfortable' | 'slightly_cold' | 'cold' | 'shivering';
  clothingCodes: string[];
}

// 3D 캐릭터 피규어 컴포넌트 (프리미티브 메쉬 결합 구조)
function ToyFigure({ gender, avatarState, clothingCodes }: ThermalAvatarProps) {
  const groupRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Mesh>(null);

  const isShivering = avatarState === 'shivering' || avatarState === 'cold';
  const isSweating = avatarState === 'sweating';

  // useFrame을 통한 60fps 물리/모션 애니메이션 시뮬레이션
  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.getElapsedTime();

    // 1. 부드러운 호흡 모션
    groupRef.current.scale.y = 1 + Math.sin(t * 2.5) * 0.012;

    // 2. 추위 떨림 모션 (Shiver)
    if (isShivering) {
      groupRef.current.position.x = Math.sin(t * 85) * 0.035;
      groupRef.current.rotation.z = Math.sin(t * 85) * 0.015;
    } else {
      groupRef.current.position.x = 0;
      groupRef.current.rotation.z = 0;
    }

    // 3. 더위 시 머리 흔들림/처짐 모션
    if (avatarState === 'sweating' || avatarState === 'hot') {
      if (headRef.current) {
        headRef.current.rotation.x = 0.08 + Math.sin(t * 1.5) * 0.02; // 약간 고개 숙임
      }
    } else {
      if (headRef.current) {
        headRef.current.rotation.x = 0;
      }
    }
  });

  const hasClothing = (code: string) => clothingCodes.includes(code);

  // 피부색 (픽사 스타일 점토 질감)
  const skinColor = '#FFD5B0';
  
  // 머리카락 색
  const hairColor = gender === 'male' ? '#2C1810' : '#4E2C1C';

  // 하의 3D 렌더링 색상 매핑
  let pantsColor = '#E2E8F0'; // 하의 미착용 시 기본 다리 톤
  if (hasClothing('jeans')) pantsColor = '#3b82f6';
  else if (hasClothing('slacks') || hasClothing('trousers')) pantsColor = '#1e293b';
  else if (hasClothing('cotton_pants')) pantsColor = '#64748b';
  else if (hasClothing('linen_shorts')) pantsColor = '#b49b6e';
  else if (hasClothing('heavy_pants')) pantsColor = '#0f172a';

  // 상의 3D 렌더링 색상 매핑
  let topColor = '#ffffff';
  if (hasClothing('active_tee')) topColor = '#3b9fd4';
  else if (hasClothing('short_sleeve_tee')) topColor = '#e5637e';
  else if (hasClothing('comfortable_tee')) topColor = '#5bb877';
  else if (hasClothing('cotton_shirt')) topColor = '#f0c030';
  else if (hasClothing('long_sleeve')) topColor = '#9c56c4';
  else if (hasClothing('long_sleeve_shirt')) topColor = '#5fbfb5';
  else if (hasClothing('sweater')) topColor = '#e91e8c';

  // 아우터 3D 렌더링 색상 매핑
  const hasOuter = hasClothing('cardigan') || hasClothing('warm_cardigan') || hasClothing('heavy_jacket');
  let outerColor = '#475569';
  if (hasClothing('cardigan') || hasClothing('warm_cardigan')) outerColor = '#ff8c00';
  else if (hasClothing('heavy_jacket')) outerColor = '#3e2723';

  return (
    <group ref={groupRef} position={[0, -0.4, 0]}>
      {/* ─── 다리 스킨 (Cylinder) ─── */}
      <mesh castShadow receiveShadow position={[-0.14, 0.1, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 0.5, 16]} />
        <meshStandardMaterial color={skinColor} roughness={0.65} />
      </mesh>
      <mesh castShadow receiveShadow position={[0.14, 0.1, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 0.5, 16]} />
        <meshStandardMaterial color={skinColor} roughness={0.65} />
      </mesh>

      {/* ─── 신발 (Box) ─── */}
      <mesh castShadow position={[-0.14, -0.15, 0.04]}>
        <boxGeometry args={[0.09, 0.08, 0.18]} />
        <meshStandardMaterial color="#37474f" roughness={0.5} />
      </mesh>
      <mesh castShadow position={[0.14, -0.15, 0.04]}>
        <boxGeometry args={[0.09, 0.08, 0.18]} />
        <meshStandardMaterial color="#37474f" roughness={0.5} />
      </mesh>

      {/* ─── 하의 레이어 ─── */}
      <mesh castShadow position={[0, 0.45, 0]}>
        <cylinderGeometry args={[0.26, 0.28, 0.42, 32]} />
        <meshStandardMaterial color={pantsColor} roughness={0.7} />
      </mesh>

      {/* ─── 몸통 스킨 ─── */}
      <mesh castShadow receiveShadow position={[0, 0.8, 0]}>
        <cylinderGeometry args={[0.25, 0.25, 0.5, 32]} />
        <meshStandardMaterial color={skinColor} roughness={0.6} />
      </mesh>

      {/* ─── 상의 레이어 ─── */}
      <mesh castShadow position={[0, 0.82, 0]}>
        <cylinderGeometry args={[0.26, 0.26, 0.44, 32]} />
        <meshStandardMaterial color={topColor} roughness={0.7} />
      </mesh>

      {/* ─── 아우터 레이어 ─── */}
      {hasOuter && (
        <mesh castShadow position={[0, 0.8, 0]}>
          {/* 가디건/자켓 실린더 형태 - z-fighting 피하기 위해 약간 넓게(0.285) 렌더링 */}
          <cylinderGeometry args={[0.285, 0.285, 0.52, 32, 1, true, 0, Math.PI * 1.65]} />
          <meshStandardMaterial color={outerColor} roughness={0.6} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* ─── 팔 (Cylinder) ─── */}
      {/* 왼팔 */}
      <mesh castShadow position={[-0.32, 0.75, 0]} rotation={[0, 0, 0.15]}>
        <cylinderGeometry args={[0.065, 0.06, 0.45, 16]} />
        <meshStandardMaterial color={hasOuter ? outerColor : topColor} roughness={0.7} />
      </mesh>
      {/* 오른팔 */}
      <mesh castShadow position={[0.32, 0.75, 0]} rotation={[0, 0, -0.15]}>
        <cylinderGeometry args={[0.065, 0.06, 0.45, 16]} />
        <meshStandardMaterial color={hasOuter ? outerColor : topColor} roughness={0.7} />
      </mesh>

      {/* ─── 얼굴/머리부 ─── */}
      <group position={[0, 1.25, 0]}>
        <mesh ref={headRef} castShadow>
          <sphereGeometry args={[0.34, 32, 32]} />
          <meshStandardMaterial color={skinColor} roughness={0.5} />
        </mesh>

        {/* 귀 */}
        <mesh position={[-0.35, 0, -0.05]} castShadow>
          <sphereGeometry args={[0.06, 16, 16]} />
          <meshStandardMaterial color={skinColor} roughness={0.5} />
        </mesh>
        <mesh position={[0.35, 0, -0.05]} castShadow>
          <sphereGeometry args={[0.06, 16, 16]} />
          <meshStandardMaterial color={skinColor} roughness={0.5} />
        </mesh>

        {/* 눈 (반짝이는 구체) */}
        <mesh position={[-0.11, 0.05, 0.29]}>
          <sphereGeometry args={[0.038, 16, 16]} />
          <meshStandardMaterial color="#1a1a2e" roughness={0.15} metalness={0.1} />
        </mesh>
        <mesh position={[0.11, 0.05, 0.29]}>
          <sphereGeometry args={[0.038, 16, 16]} />
          <meshStandardMaterial color="#1a1a2e" roughness={0.15} metalness={0.1} />
        </mesh>

        {/* 코 (귀여운 점토 느낌 코) */}
        <mesh position={[0, -0.02, 0.32]}>
          <sphereGeometry args={[0.032, 16, 16]} />
          <meshStandardMaterial color="#eebe96" roughness={0.4} />
        </mesh>

        {/* 입 */}
        <mesh position={[0, -0.12, 0.3]} rotation={[0.08, 0, 0]}>
          {avatarState === 'comfortable' ? (
            // 웃는 입 (토러스 구조)
            <torusGeometry args={[0.04, 0.012, 8, 24, Math.PI]} />
          ) : isShivering ? (
            // 떨리는 얇은 입 (Box)
            <boxGeometry args={[0.07, 0.012, 0.015]} />
          ) : (
            // 벌린 슬픈 입/더운 입 (Sphere 절반 형태)
            <sphereGeometry args={[0.035, 12, 12, 0, Math.PI * 2, 0, Math.PI / 1.9]} />
          )}
          <meshStandardMaterial color="#a83c2a" roughness={0.4} />
        </mesh>

        {/* 볼터치 (두 볼에 붉은 머티리얼 적용한 편평한 구체) */}
        <mesh position={[-0.19, -0.05, 0.27]} scale={[1, 0.6, 0.1]}>
          <sphereGeometry args={[0.05, 16, 16]} />
          <meshStandardMaterial color="rgba(255,100,100,0.55)" roughness={0.7} transparent opacity={0.65} />
        </mesh>
        <mesh position={[0.19, -0.05, 0.27]} scale={[1, 0.6, 0.1]}>
          <sphereGeometry args={[0.05, 16, 16]} />
          <meshStandardMaterial color="rgba(255,100,100,0.55)" roughness={0.7} transparent opacity={0.65} />
        </mesh>

        {/* 머리카락 (뒤/앞) */}
        {/* 뒷머리 가발 형태 */}
        <mesh position={[0, 0.12, -0.08]} castShadow>
          <sphereGeometry args={[0.36, 32, 32, 0, Math.PI * 2, 0, Math.PI * 0.72]} />
          <meshStandardMaterial color={hairColor} roughness={0.75} />
        </mesh>

        {/* 성별 앞머리 스타일 차별화 */}
        {gender === 'female' ? (
          <>
            {/* 단발 머리 양 옆 사이드 캡슐 */}
            <mesh position={[-0.32, -0.06, -0.1]} rotation={[0, 0, 0.15]} castShadow>
              <sphereGeometry args={[0.12, 16, 16]} />
              <meshStandardMaterial color={hairColor} roughness={0.75} />
            </mesh>
            <mesh position={[0.32, -0.06, -0.1]} rotation={[0, 0, -0.15]} castShadow>
              <sphereGeometry args={[0.12, 16, 16]} />
              <meshStandardMaterial color={hairColor} roughness={0.75} />
            </mesh>
          </>
        ) : (
          /* 남성 짧은 머리 앞 뱅 컷 */
          <mesh position={[0, 0.22, 0.18]} rotation={[0.25, 0, 0]} castShadow>
            <boxGeometry args={[0.28, 0.11, 0.16]} />
            <meshStandardMaterial color={hairColor} roughness={0.75} />
          </mesh>
        )}
      </group>
    </group>
  );
}

export default function ThermalAvatar(props: ThermalAvatarProps) {
  const [mounted, setMounted] = useState(false);

  // Next.js SSR 환경에서 canvas가 클라이언트 마운트 후 렌더링되게 방지
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div 
        className="relative mx-auto rounded-2xl bg-slate-950/20 border border-white/5 flex items-center justify-center"
        style={{ width: 180, height: 240 }}
      >
        <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div
      className="relative mx-auto select-none overflow-hidden rounded-2xl bg-slate-950/15 border border-white/5 shadow-2xl transition-all duration-300"
      style={{ width: 180, height: 240 }}
    >
      <Canvas
        shadows
        camera={{ position: [0, 0.7, 2.3], fov: 42 }}
        gl={{ antialias: true, alpha: true }}
      >
        {/* 감각적인 뽀샤시 조명 */}
        <ambientLight intensity={0.55} />
        <directionalLight
          castShadow
          position={[2.0, 3.5, 2.0]}
          intensity={0.88}
          shadow-mapSize={[512, 512]}
          shadow-bias={-0.0001}
        />
        {/* 캐릭터 뒷라인을 살리는 블루 포인트 림 라이트 */}
        <pointLight position={[-1.8, 1.2, -1.0]} intensity={0.45} color="#60a5fa" />
        <pointLight position={[1.8, 0.8, -1.0]} intensity={0.25} color="#f472b6" />

        {/* 3D 점토 토이 피규어 */}
        <ToyFigure {...props} />

        {/* 부드러운 소프트 바닥 그림자 */}
        <ContactShadows
          position={[0, -0.78, 0]}
          opacity={0.68}
          scale={2.2}
          blur={1.6}
          far={1.2}
        />

        {/* 360도 인터랙티브 컨트롤 (상하 각도 제한, 줌 금지) */}
        <OrbitControls
          enableZoom={false}
          enablePan={false}
          minPolarAngle={Math.PI / 3}
          maxPolarAngle={Math.PI / 1.75}
        />
      </Canvas>
    </div>
  );
}
