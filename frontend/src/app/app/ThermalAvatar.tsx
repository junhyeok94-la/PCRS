'use client';

import React from 'react';

interface ThermalAvatarProps {
  gender: 'male' | 'female';
  avatarState: 'sweating' | 'hot' | 'slightly_hot' | 'comfortable' | 'slightly_cold' | 'cold' | 'shivering';
  clothingCodes: string[];
}

export default function ThermalAvatar({ gender, avatarState, clothingCodes }: ThermalAvatarProps) {
  const hasClothing = (code: string) => clothingCodes.includes(code);
  const isSweating = avatarState === 'sweating';
  const isShivering = avatarState === 'shivering' || avatarState === 'cold';

  // 상태별 얼굴 표정 데이터
  const expression = {
    sweating: {
      eyeShape: 'squeeze',  // 찡그린
      mouth: 'grimace',
      blushColor: 'rgba(255,120,120,0.55)',
      eyeColor: '#c0392b',
    },
    hot: {
      eyeShape: 'half',     // 반쯤 감긴
      mouth: 'open_sad',
      blushColor: 'rgba(255,160,100,0.5)',
      eyeColor: '#e74c3c',
    },
    slightly_hot: {
      eyeShape: 'normal',
      mouth: 'slight_frown',
      blushColor: 'rgba(255,180,130,0.4)',
      eyeColor: '#2c3e50',
    },
    comfortable: {
      eyeShape: 'happy',    // ^^ 눈
      mouth: 'smile',
      blushColor: 'rgba(255,180,180,0.45)',
      eyeColor: '#2c3e50',
    },
    slightly_cold: {
      eyeShape: 'normal',
      mouth: 'neutral',
      blushColor: 'rgba(150,200,255,0.35)',
      eyeColor: '#2c3e50',
    },
    cold: {
      eyeShape: 'sad',
      mouth: 'frown',
      blushColor: 'rgba(100,160,255,0.4)',
      eyeColor: '#2980b9',
    },
    shivering: {
      eyeShape: 'cry',
      mouth: 'shiver',
      blushColor: 'rgba(80,130,255,0.45)',
      eyeColor: '#2980b9',
    },
  }[avatarState] ?? {
    eyeShape: 'normal',
    mouth: 'neutral',
    blushColor: 'rgba(255,180,180,0.35)',
    eyeColor: '#2c3e50',
  };

  // 피부색
  const skinLight = '#FFD5B0';
  const skinMid = '#F0B887';
  const skinDark = '#D99060';

  // 머리카락 색
  const hairColor = gender === 'male' ? '#2C1810' : '#3D1F14';
  const hairHighlight = gender === 'male' ? '#5C3522' : '#6B3A28';

  return (
    <div
      className="relative mx-auto select-none"
      style={{ width: 180, height: 240 }}
    >
      <style>{`
        @keyframes avatarShiver {
          0%, 100% { transform: translateX(0) rotate(0deg); }
          20% { transform: translateX(-2px) rotate(-0.8deg); }
          40% { transform: translateX(2px) rotate(0.8deg); }
          60% { transform: translateX(-1.5px) rotate(-0.5deg); }
          80% { transform: translateX(1.5px) rotate(0.5deg); }
        }
        @keyframes sweatDrop {
          0% { transform: translateY(0) scaleY(0.6); opacity: 0; }
          20% { opacity: 1; }
          100% { transform: translateY(18px) scaleY(1.1); opacity: 0; }
        }
        @keyframes breathe {
          0%, 100% { transform: scaleY(1); }
          50% { transform: scaleY(1.015); }
        }
        @keyframes eyeBlink {
          0%, 92%, 100% { transform: scaleY(1); }
          96% { transform: scaleY(0.08); }
        }
        .avatar-body { animation: breathe 3.5s ease-in-out infinite; transform-origin: center bottom; }
        .avatar-shiver { animation: avatarShiver 0.18s ease-in-out infinite; }
        .sweat-drop-1 { animation: sweatDrop 2.2s ease-in infinite; animation-delay: 0s; }
        .sweat-drop-2 { animation: sweatDrop 2.2s ease-in infinite; animation-delay: 1.1s; }
        .eye-blink { animation: eyeBlink 4s ease-in-out infinite; transform-origin: center center; }
      `}</style>

      <svg
        viewBox="0 0 180 240"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={isShivering ? 'avatar-shiver' : ''}
        style={{ width: '100%', height: '100%' }}
      >
        <defs>
          {/* 피부 그라디언트 */}
          <radialGradient id="faceGrad" cx="45%" cy="38%" r="60%">
            <stop offset="0%" stopColor="#FFE5C5" />
            <stop offset="55%" stopColor={skinLight} />
            <stop offset="100%" stopColor={skinMid} />
          </radialGradient>
          <radialGradient id="bodyGrad" cx="50%" cy="30%" r="65%">
            <stop offset="0%" stopColor={skinLight} />
            <stop offset="100%" stopColor={skinMid} />
          </radialGradient>
          <radialGradient id="cheekGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={expression.blushColor} />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>
          {/* 눈 그라디언트 */}
          <radialGradient id="eyeGrad" cx="40%" cy="35%" r="60%">
            <stop offset="0%" stopColor="#6B8FCF" />
            <stop offset="60%" stopColor={expression.eyeColor} />
            <stop offset="100%" stopColor="#1a1a2e" />
          </radialGradient>
          <radialGradient id="eyeHighlight" cx="35%" cy="30%" r="40%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.95)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>
          {/* 머리카락 그라디언트 */}
          <radialGradient id="hairGrad" cx="35%" cy="25%" r="70%">
            <stop offset="0%" stopColor={hairHighlight} />
            <stop offset="100%" stopColor={hairColor} />
          </radialGradient>
          {/* 옷 그라디언트들 */}
          <linearGradient id="teeBlue" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#7EC8F5" />
            <stop offset="100%" stopColor="#3B9FD4" />
          </linearGradient>
          <linearGradient id="teePink" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FF9BAE" />
            <stop offset="100%" stopColor="#E5637E" />
          </linearGradient>
          <linearGradient id="teeGreen" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#90D6A3" />
            <stop offset="100%" stopColor="#5BB877" />
          </linearGradient>
          <linearGradient id="teeYellow" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFE47A" />
            <stop offset="100%" stopColor="#F0C030" />
          </linearGradient>
          <linearGradient id="shirtteal" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#9FE0D8" />
            <stop offset="100%" stopColor="#5FBFB5" />
          </linearGradient>
          <linearGradient id="slacksDark" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#546E7A" />
            <stop offset="100%" stopColor="#2C3E50" />
          </linearGradient>
          <linearGradient id="jeansBlue" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#7986CB" />
            <stop offset="100%" stopColor="#3949AB" />
          </linearGradient>
          <linearGradient id="cardiganOrange" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFD180" />
            <stop offset="100%" stopColor="#FF8C00" />
          </linearGradient>
          <linearGradient id="sweaterPink" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#F8BBD9" />
            <stop offset="100%" stopColor="#E91E8C" />
          </linearGradient>
          <linearGradient id="jacketBrown" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#6D4C41" />
            <stop offset="100%" stopColor="#3E2723" />
          </linearGradient>
          <linearGradient id="pantsGray" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#90A4AE" />
            <stop offset="100%" stopColor="#546E7A" />
          </linearGradient>
          <linearGradient id="heavyPantsDark" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#546E7A" />
            <stop offset="100%" stopColor="#263238" />
          </linearGradient>
          <linearGradient id="longsleevePurple" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#D1A3E8" />
            <stop offset="100%" stopColor="#9C56C4" />
          </linearGradient>
          <linearGradient id="linen" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#EDE0D4" />
            <stop offset="100%" stopColor="#C9B99A" />
          </linearGradient>
          {/* 그림자 필터 */}
          <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="1" dy="3" stdDeviation="3" floodColor="rgba(0,0,0,0.22)" />
          </filter>
          <filter id="glowFilter" x="-15%" y="-15%" width="130%" height="130%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* ─── 바닥 그림자 ─── */}
        <ellipse cx="90" cy="233" rx="38" ry="5" fill="rgba(0,0,0,0.13)" />

        {/* ─── 신발 ─── */}
        <ellipse cx="72" cy="220" rx="14" ry="6" fill="#37474F" />
        <ellipse cx="108" cy="220" rx="14" ry="6" fill="#37474F" />
        <ellipse cx="70" cy="218" rx="10" ry="4" fill="#546E7A" />
        <ellipse cx="106" cy="218" rx="10" ry="4" fill="#546E7A" />

        {/* ─── 다리 (스킨) ─── */}
        <rect x="69" y="170" width="14" height="50" rx="6" fill="url(#bodyGrad)" />
        <rect x="97" y="170" width="14" height="50" rx="6" fill="url(#bodyGrad)" />
        {/* 다리 하이라이트 */}
        <rect x="72" y="175" width="5" height="30" rx="2.5" fill="rgba(255,255,255,0.22)" />
        <rect x="100" y="175" width="5" height="30" rx="2.5" fill="rgba(255,255,255,0.22)" />

        {/* ─── 팔 (스킨 기본) ─── */}
        {/* 왼팔 */}
        <path
          d="M 60,120 C 48,128 42,148 45,168 C 46,172 52,172 54,168 C 52,150 58,134 66,128 Z"
          fill="url(#bodyGrad)"
        />
        {/* 오른팔 */}
        <path
          d="M 120,120 C 132,128 138,148 135,168 C 134,172 128,172 126,168 C 128,150 122,134 114,128 Z"
          fill="url(#bodyGrad)"
        />

        {/* ─── 하의 레이어 ─── */}
        {/* linen_shorts */}
        {hasClothing('linen_shorts') && (
          <g filter="url(#softShadow)">
            <path d="M 60,160 Q 58,165 60,175 L 76,175 L 76,162 L 84,162 L 84,175 L 96,175 L 96,162 L 104,162 L 104,175 L 120,175 L 120,160 Z" fill="url(#linen)" />
            <path d="M 60,160 H 120 V 165 H 60 Z" fill="rgba(180,155,110,0.3)" />
            <line x1="90" y1="160" x2="90" y2="175" stroke="rgba(180,155,110,0.5)" strokeWidth="1.5" />
          </g>
        )}
        {/* slacks */}
        {hasClothing('slacks') && (
          <g filter="url(#softShadow)">
            <path d="M 60,160 Q 58,165 60,215 L 78,215 L 78,180 L 84,180 L 84,215 L 96,215 L 96,180 L 102,180 L 102,215 L 120,215 L 120,160 Z" fill="url(#slacksDark)" />
            <path d="M 60,160 H 120 V 167 H 60 Z" fill="rgba(255,255,255,0.08)" />
            <line x1="90" y1="160" x2="90" y2="215" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" />
          </g>
        )}
        {/* cotton_pants */}
        {hasClothing('cotton_pants') && (
          <g filter="url(#softShadow)">
            <path d="M 60,160 Q 58,165 60,215 L 78,215 L 78,180 L 84,180 L 84,215 L 96,215 L 96,180 L 102,180 L 102,215 L 120,215 L 120,160 Z" fill="url(#pantsGray)" />
            <path d="M 60,160 H 120 V 167 H 60 Z" fill="rgba(255,255,255,0.12)" />
          </g>
        )}
        {/* jeans */}
        {hasClothing('jeans') && (
          <g filter="url(#softShadow)">
            <path d="M 58,160 Q 56,165 58,215 L 77,215 L 77,180 L 84,180 L 84,215 L 96,215 L 96,180 L 103,180 L 103,215 L 122,215 L 122,160 Z" fill="url(#jeansBlue)" />
            {/* 청바지 질감 */}
            <path d="M 58,160 H 122 V 167 H 58 Z" fill="rgba(255,255,255,0.15)" />
            <line x1="90" y1="160" x2="90" y2="215" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
            {/* 포켓 */}
            <path d="M 62,168 Q 65,175 74,174" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" fill="none" />
            <path d="M 118,168 Q 115,175 106,174" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" fill="none" />
          </g>
        )}
        {/* trousers */}
        {hasClothing('trousers') && (
          <g filter="url(#softShadow)">
            <path d="M 58,160 Q 56,165 58,215 L 77,215 L 77,180 L 84,180 L 84,215 L 96,215 L 96,180 L 103,180 L 103,215 L 122,215 L 122,160 Z" fill="url(#slacksDark)" />
            <path d="M 58,160 H 122 V 167 H 58 Z" fill="rgba(255,255,255,0.08)" />
          </g>
        )}
        {/* heavy_pants */}
        {hasClothing('heavy_pants') && (
          <g filter="url(#softShadow)">
            <path d="M 56,158 Q 54,163 56,218 L 76,218 L 76,178 L 84,178 L 84,218 L 96,218 L 96,178 L 104,178 L 104,218 L 124,218 L 124,158 Z" fill="url(#heavyPantsDark)" />
            <path d="M 56,158 H 124 V 167 H 56 Z" fill="rgba(255,255,255,0.1)" />
          </g>
        )}

        {/* ─── 몸통 (상의 없을 때 스킨) ─── */}
        <ellipse cx="90" cy="148" rx="30" ry="35" fill="url(#bodyGrad)" />

        {/* ─── 상의 레이어 ─── */}
        {/* active_tee */}
        {hasClothing('active_tee') && (
          <g filter="url(#softShadow)">
            <path d="M 57,115 C 52,118 46,130 45,168 L 55,168 C 56,145 62,132 66,128 L 68,115 Z" fill="url(#teeBlue)" />
            <path d="M 123,115 C 128,118 134,130 135,168 L 125,168 C 124,145 118,132 114,128 L 112,115 Z" fill="url(#teeBlue)" />
            <rect x="57" y="108" width="66" height="65" rx="8" fill="url(#teeBlue)" />
            <path d="M 57,108 H 123 V 118 H 57 Z" rx="5" fill="rgba(255,255,255,0.2)" />
            {/* 네크라인 */}
            <path d="M 76,108 Q 90,118 104,108" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" fill="none" />
          </g>
        )}
        {/* short_sleeve_tee */}
        {hasClothing('short_sleeve_tee') && (
          <g filter="url(#softShadow)">
            <path d="M 57,115 C 52,118 46,130 45,155 L 55,155 C 56,138 62,128 66,125 L 68,115 Z" fill="url(#teePink)" />
            <path d="M 123,115 C 128,118 134,130 135,155 L 125,155 C 124,138 118,128 114,125 L 112,115 Z" fill="url(#teePink)" />
            <rect x="57" y="108" width="66" height="65" rx="8" fill="url(#teePink)" />
            <path d="M 57,108 H 123 V 118 H 57 Z" rx="5" fill="rgba(255,255,255,0.2)" />
            <path d="M 76,108 Q 90,118 104,108" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" fill="none" />
          </g>
        )}
        {/* comfortable_tee */}
        {hasClothing('comfortable_tee') && (
          <g filter="url(#softShadow)">
            <path d="M 57,115 C 52,118 46,130 45,155 L 55,155 C 56,138 62,128 66,125 L 68,115 Z" fill="url(#teeGreen)" />
            <path d="M 123,115 C 128,118 134,130 135,155 L 125,155 C 124,138 118,128 114,125 L 112,115 Z" fill="url(#teeGreen)" />
            <rect x="57" y="108" width="66" height="65" rx="8" fill="url(#teeGreen)" />
            <path d="M 57,108 H 123 V 118 H 57 Z" rx="5" fill="rgba(255,255,255,0.2)" />
            <path d="M 76,108 Q 90,118 104,108" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" fill="none" />
          </g>
        )}
        {/* cotton_shirt */}
        {hasClothing('cotton_shirt') && (
          <g filter="url(#softShadow)">
            <path d="M 55,112 C 50,116 43,128 42,168 L 52,168 L 52,130 L 66,124 L 68,112 Z" fill="url(#teeYellow)" />
            <path d="M 125,112 C 130,116 137,128 138,168 L 128,168 L 128,130 L 114,124 L 112,112 Z" fill="url(#teeYellow)" />
            <rect x="55" y="105" width="70" height="70" rx="8" fill="url(#teeYellow)" />
            <path d="M 55,105 H 125 V 118 H 55 Z" fill="rgba(255,255,255,0.18)" />
            {/* 단추 */}
            <line x1="90" y1="108" x2="90" y2="175" stroke="rgba(180,150,50,0.5)" strokeWidth="1.5" />
            <circle cx="90" cy="118" r="2.5" fill="#C8A032" />
            <circle cx="90" cy="130" r="2.5" fill="#C8A032" />
            <circle cx="90" cy="142" r="2.5" fill="#C8A032" />
            <circle cx="90" cy="154" r="2.5" fill="#C8A032" />
          </g>
        )}
        {/* long_sleeve */}
        {hasClothing('long_sleeve') && (
          <g filter="url(#softShadow)">
            {/* 긴 소매 */}
            <path d="M 57,114 C 50,118 40,135 38,168 L 50,170 C 52,150 58,132 66,126 L 68,114 Z" fill="url(#longsleevePurple)" />
            <path d="M 123,114 C 130,118 140,135 142,168 L 130,170 C 128,150 122,132 114,126 L 112,114 Z" fill="url(#longsleevePurple)" />
            <rect x="57" y="107" width="66" height="66" rx="8" fill="url(#longsleevePurple)" />
            <path d="M 57,107 H 123 V 118 H 57 Z" fill="rgba(255,255,255,0.18)" />
            <path d="M 76,107 Q 90,117 104,107" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" fill="none" />
          </g>
        )}
        {/* long_sleeve_shirt */}
        {hasClothing('long_sleeve_shirt') && (
          <g filter="url(#softShadow)">
            <path d="M 55,112 C 48,116 38,133 36,168 L 48,170 L 50,130 L 66,124 L 68,112 Z" fill="url(#shirtteal)" />
            <path d="M 125,112 C 132,116 142,133 144,168 L 132,170 L 130,130 L 114,124 L 112,112 Z" fill="url(#shirtteal)" />
            <rect x="55" y="105" width="70" height="70" rx="8" fill="url(#shirtteal)" />
            <path d="M 55,105 H 125 V 118 H 55 Z" fill="rgba(255,255,255,0.18)" />
            <line x1="90" y1="108" x2="90" y2="175" stroke="rgba(60,150,140,0.5)" strokeWidth="1.5" />
          </g>
        )}
        {/* sweater */}
        {hasClothing('sweater') && (
          <g filter="url(#softShadow)">
            <path d="M 54,112 C 47,116 36,134 34,170 L 46,172 L 48,128 L 65,122 L 67,112 Z" fill="url(#sweaterPink)" />
            <path d="M 126,112 C 133,116 144,134 146,170 L 134,172 L 132,128 L 115,122 L 113,112 Z" fill="url(#sweaterPink)" />
            <rect x="54" y="104" width="72" height="72" rx="9" fill="url(#sweaterPink)" />
            <path d="M 54,104 H 126 V 118 H 54 Z" fill="rgba(255,255,255,0.15)" />
            {/* 니트 줄무늬 */}
            {[115, 128, 141, 154, 167].map((y, i) => (
              <line key={i} x1="54" y1={y} x2="126" y2={y} stroke="rgba(255,255,255,0.12)" strokeWidth="2" />
            ))}
          </g>
        )}

        {/* ─── 아우터 레이어 ─── */}
        {/* cardigan */}
        {hasClothing('cardigan') && (
          <g filter="url(#softShadow)">
            {/* 왼쪽 패널 */}
            <path d="M 54,104 L 64,104 L 64,175 L 54,175 C 48,160 46,140 47,118 Z" fill="url(#cardiganOrange)" />
            {/* 오른쪽 패널 */}
            <path d="M 126,104 L 116,104 L 116,175 L 126,175 C 132,160 134,140 133,118 Z" fill="url(#cardiganOrange)" />
            {/* 소매 */}
            <path d="M 52,110 C 44,118 36,138 34,168 L 46,170 L 48,130 L 65,122 L 66,110 Z" fill="url(#cardiganOrange)" />
            <path d="M 128,110 C 136,118 144,138 146,168 L 134,170 L 132,130 L 115,122 L 114,110 Z" fill="url(#cardiganOrange)" />
          </g>
        )}
        {/* warm_cardigan */}
        {hasClothing('warm_cardigan') && (
          <g filter="url(#softShadow)">
            <path d="M 52,102 L 63,102 L 63,177 L 52,177 C 46,162 44,140 45,116 Z" fill="url(#cardiganOrange)" />
            <path d="M 128,102 L 117,102 L 117,177 L 128,177 C 134,162 136,140 135,116 Z" fill="url(#cardiganOrange)" />
            <path d="M 50,108 C 42,116 34,138 32,170 L 44,172 L 47,128 L 64,120 L 65,108 Z" fill="url(#cardiganOrange)" />
            <path d="M 130,108 C 138,116 146,138 148,170 L 136,172 L 133,128 L 116,120 L 115,108 Z" fill="url(#cardiganOrange)" />
          </g>
        )}
        {/* heavy_jacket */}
        {hasClothing('heavy_jacket') && (
          <g filter="url(#softShadow)">
            <path d="M 48,100 C 40,108 33,130 30,172 L 44,174 L 47,126 L 62,118 L 64,100 Z" fill="url(#jacketBrown)" />
            <path d="M 132,100 C 140,108 147,130 150,172 L 136,174 L 133,126 L 118,118 L 116,100 Z" fill="url(#jacketBrown)" />
            <rect x="48" y="94" width="84" height="84" rx="12" fill="url(#jacketBrown)" />
            <path d="M 48,94 H 132 V 110 H 48 Z" fill="rgba(255,255,255,0.1)" />
            {/* 지퍼 라인 */}
            <line x1="90" y1="97" x2="90" y2="178" stroke="#B0BEC5" strokeWidth="2.5" />
            <ellipse cx="90" cy="125" rx="4" ry="3" fill="#90A4AE" />
            {/* 칼라 */}
            <path d="M 70,97 Q 90,110 110,97" stroke="#6D4C41" strokeWidth="4" fill="none" strokeLinecap="round" />
          </g>
        )}

        {/* ─── 목 ─── */}
        <rect x="82" y="92" width="16" height="18" rx="6" fill="url(#faceGrad)" />

        {/* ─── 머리카락 (뒤) ─── */}
        {gender === 'male' ? (
          <path
            d="M 58,68 C 56,48 68,35 90,35 C 112,35 124,48 122,68 C 122,57 115,45 90,45 C 65,45 58,57 58,68 Z"
            fill="url(#hairGrad)"
          />
        ) : (
          <g>
            <path
              d="M 58,70 C 54,48 66,32 90,32 C 114,32 126,48 122,70"
              fill="url(#hairGrad)"
              stroke="none"
            />
            {/* 긴 머리 */}
            <path
              d="M 58,70 C 54,88 52,108 56,128 C 58,136 63,138 66,130 C 62,112 60,92 62,76 Z"
              fill="url(#hairGrad)"
            />
            <path
              d="M 122,70 C 126,88 128,108 124,128 C 122,136 117,138 114,130 C 118,112 120,92 118,76 Z"
              fill="url(#hairGrad)"
            />
          </g>
        )}

        {/* ─── 얼굴 (3D 볼륨감) ─── */}
        <ellipse cx="90" cy="68" rx="32" ry="34" fill="url(#faceGrad)" filter="url(#softShadow)" />
        {/* 얼굴 하이라이트 */}
        <ellipse cx="80" cy="56" rx="10" ry="8" fill="rgba(255,255,255,0.22)" />
        {/* 귀 */}
        <ellipse cx="59" cy="68" rx="6" ry="8" fill={skinLight} />
        <ellipse cx="121" cy="68" rx="6" ry="8" fill={skinLight} />
        <ellipse cx="59" cy="68" rx="3.5" ry="5" fill={skinMid} />
        <ellipse cx="121" cy="68" rx="3.5" ry="5" fill={skinMid} />

        {/* ─── 머리카락 (앞) ─── */}
        {gender === 'male' ? (
          <g>
            {/* 숏컷 앞머리 */}
            <path d="M 62,60 C 64,40 72,36 90,36 C 108,36 116,40 118,60 C 112,48 100,44 90,44 C 80,44 68,48 62,60 Z" fill="url(#hairGrad)" />
            {/* 왼쪽 앞머리 가닥 */}
            <path d="M 64,56 Q 70,48 78,52 Q 73,58 67,60 Z" fill={hairColor} />
          </g>
        ) : (
          <g>
            {/* 단발 앞머리 */}
            <path d="M 60,62 C 62,40 70,33 90,33 C 110,33 118,40 120,62 C 114,49 102,44 90,44 C 78,44 66,49 60,62 Z" fill="url(#hairGrad)" />
            {/* 앞머리 가닥 */}
            <path d="M 66,50 Q 76,44 86,48 Q 78,56 70,56 Z" fill={hairColor} />
            <path d="M 82,45 Q 92,42 100,46 Q 94,52 84,52 Z" fill={hairHighlight} />
          </g>
        )}

        {/* ─── 볼터치 ─── */}
        <ellipse cx="68" cy="74" rx="10" ry="7" fill="url(#cheekGrad)" />
        <ellipse cx="112" cy="74" rx="10" ry="7" fill="url(#cheekGrad)" />

        {/* ─── 눈 (큰 반짝이는 눈) ─── */}
        {/* 왼쪽 눈 */}
        <g className="eye-blink" style={{ transformBox: 'fill-box' }}>
          {expression.eyeShape === 'happy' && (
            <path d="M 72,66 Q 78,60 84,66" stroke={expression.eyeColor} strokeWidth="3.5" strokeLinecap="round" fill="none" />
          )}
          {expression.eyeShape === 'squeeze' && (
            <path d="M 72,66 Q 78,70 84,66" stroke={expression.eyeColor} strokeWidth="3.5" strokeLinecap="round" fill="none" />
          )}
          {(expression.eyeShape === 'normal' || expression.eyeShape === 'half' || expression.eyeShape === 'sad' || expression.eyeShape === 'cry') && (
            <g>
              <ellipse cx="78" cy="66" rx="8" ry={expression.eyeShape === 'half' ? 4 : 9} fill="url(#eyeGrad)" />
              <ellipse cx="78" cy="66" rx="8" ry={expression.eyeShape === 'half' ? 4 : 9} fill="none" stroke="rgba(0,0,0,0.2)" strokeWidth="0.8" />
              {/* 하이라이트 */}
              <ellipse cx="74" cy="62" rx="3.5" ry="3" fill="url(#eyeHighlight)" />
              <ellipse cx="80" cy="69" rx="1.5" ry="1.5" fill="rgba(255,255,255,0.4)" />
            </g>
          )}
        </g>
        {/* 오른쪽 눈 */}
        <g className="eye-blink" style={{ transformBox: 'fill-box' }}>
          {expression.eyeShape === 'happy' && (
            <path d="M 96,66 Q 102,60 108,66" stroke={expression.eyeColor} strokeWidth="3.5" strokeLinecap="round" fill="none" />
          )}
          {expression.eyeShape === 'squeeze' && (
            <path d="M 96,66 Q 102,70 108,66" stroke={expression.eyeColor} strokeWidth="3.5" strokeLinecap="round" fill="none" />
          )}
          {(expression.eyeShape === 'normal' || expression.eyeShape === 'half' || expression.eyeShape === 'sad' || expression.eyeShape === 'cry') && (
            <g>
              <ellipse cx="102" cy="66" rx="8" ry={expression.eyeShape === 'half' ? 4 : 9} fill="url(#eyeGrad)" />
              <ellipse cx="102" cy="66" rx="8" ry={expression.eyeShape === 'half' ? 4 : 9} fill="none" stroke="rgba(0,0,0,0.2)" strokeWidth="0.8" />
              <ellipse cx="98" cy="62" rx="3.5" ry="3" fill="url(#eyeHighlight)" />
              <ellipse cx="104" cy="69" rx="1.5" ry="1.5" fill="rgba(255,255,255,0.4)" />
            </g>
          )}
        </g>

        {/* ─── 눈썹 ─── */}
        {expression.eyeShape === 'squeeze' || expression.eyeShape === 'sad' ? (
          <>
            <path d="M 71,57 Q 78,53 85,57" stroke={hairColor} strokeWidth="2.5" strokeLinecap="round" fill="none" transform="rotate(8, 78, 57)" />
            <path d="M 95,57 Q 102,53 109,57" stroke={hairColor} strokeWidth="2.5" strokeLinecap="round" fill="none" transform="rotate(-8, 102, 57)" />
          </>
        ) : (
          <>
            <path d="M 71,57 Q 78,53 85,57" stroke={hairColor} strokeWidth="2.5" strokeLinecap="round" fill="none" />
            <path d="M 95,57 Q 102,53 109,57" stroke={hairColor} strokeWidth="2.5" strokeLinecap="round" fill="none" />
          </>
        )}

        {/* ─── 코 ─── */}
        <path d="M 88,74 Q 90,79 92,74" stroke={skinDark} strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.6" />

        {/* ─── 입 ─── */}
        {expression.mouth === 'smile' && (
          <path d="M 79,84 Q 90,94 101,84" stroke="#C0604A" strokeWidth="2.5" strokeLinecap="round" fill="rgba(220,100,80,0.18)" />
        )}
        {expression.mouth === 'slight_frown' && (
          <path d="M 80,86 Q 90,92 100,86" stroke="#C0604A" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        )}
        {expression.mouth === 'grimace' && (
          <>
            <path d="M 79,86 Q 90,84 101,86" stroke="#B04030" strokeWidth="2.5" strokeLinecap="round" fill="none" />
            <path d="M 81,86 Q 90,90 99,86" stroke="#D06050" strokeWidth="1" strokeLinecap="round" fill="rgba(200,80,60,0.2)" />
          </>
        )}
        {expression.mouth === 'open_sad' && (
          <>
            <path d="M 80,86 Q 90,96 100,86" stroke="#B04030" strokeWidth="2.5" strokeLinecap="round" fill="rgba(180,60,40,0.15)" />
            <ellipse cx="90" cy="89" rx="6" ry="4" fill="rgba(180,60,40,0.15)" />
          </>
        )}
        {expression.mouth === 'neutral' && (
          <path d="M 80,87 H 100" stroke="#C0604A" strokeWidth="2.2" strokeLinecap="round" />
        )}
        {expression.mouth === 'frown' && (
          <path d="M 80,90 Q 90,84 100,90" stroke="#6090C0" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        )}
        {expression.mouth === 'shiver' && (
          <path d="M 78,90 Q 83,86 88,90 Q 93,94 98,90 Q 102,86 105,90" stroke="#6090C0" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        )}

        {/* ─── 땀방울 효과 ─── */}
        {isSweating && (
          <g>
            {/* 땀방울 1 (왼쪽 얼굴) */}
            <path
              className="sweat-drop-1"
              d="M 62,60 C 60,60 58,62 58,64 C 58,66.5 59.5,67.5 62,67.5 C 64.5,67.5 66,66.5 66,64 C 66,62 64,60 62,60 Z"
              fill="#48CAE4"
              opacity="0.9"
            />
            {/* 땀방울 2 (오른쪽 이마) */}
            <path
              className="sweat-drop-2"
              d="M 110,55 C 108,55 106,57 106,59 C 106,61.5 107.5,62.5 110,62.5 C 112.5,62.5 114,61.5 114,59 C 114,57 112,55 110,55 Z"
              fill="#48CAE4"
              opacity="0.9"
            />
            {/* 땀방울 하이라이트 */}
            <ellipse className="sweat-drop-1" cx="60.5" cy="62" rx="1.2" ry="1" fill="rgba(255,255,255,0.8)" />
            <ellipse className="sweat-drop-2" cx="108.5" cy="57" rx="1.2" ry="1" fill="rgba(255,255,255,0.8)" />
          </g>
        )}

        {/* ─── 추위 효과 (오돌토돌 선) ─── */}
        {isShivering && (
          <g opacity="0.65">
            <path d="M 40,140 Q 43,136 46,140 Q 49,144 52,140" stroke="#90CAF9" strokeWidth="2" fill="none" strokeLinecap="round" />
            <path d="M 128,140 Q 131,136 134,140 Q 137,144 140,140" stroke="#90CAF9" strokeWidth="2" fill="none" strokeLinecap="round" />
          </g>
        )}
      </svg>
    </div>
  );
}
