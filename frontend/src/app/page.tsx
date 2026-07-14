import Link from "next/link";
import { ArrowRight, Thermometer, ShieldAlert, Cpu, Sparkles } from "lucide-react";

export default function Home() {
  return (
    <div className="relative min-h-screen bg-zinc-950 flex flex-col justify-between overflow-hidden">
      {/* Background Decorative Gradients */}
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-amber-500/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] rounded-full bg-orange-600/10 blur-[150px] pointer-events-none" />

      {/* Navigation Header */}
      <header className="w-full max-w-7xl mx-auto px-6 py-6 flex items-center justify-between z-10">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500">
            <Thermometer className="w-6 h-6 animate-pulse" />
          </div>
          <span className="text-xl font-bold tracking-tight text-white font-sans">
            Thermal <span className="text-amber-500">Guide</span>
          </span>
        </div>
        <Link 
          href="/app" 
          className="px-5 py-2.5 rounded-full text-sm font-medium glass hover:bg-zinc-800/80 border border-zinc-800 transition-all duration-300 text-zinc-300"
        >
          대시보드 바로가기
        </Link>
      </header>

      {/* Main Hero Section */}
      <main className="flex-1 max-w-5xl mx-auto px-6 flex flex-col items-center justify-center text-center z-10 py-16">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-xs font-semibold text-amber-400 mb-8 animate-bounce">
          <Sparkles className="w-3.5 h-3.5" />
          <span>v2.0 대규모 트래픽 아키텍처 오픈</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white max-w-4xl leading-tight sm:leading-none mb-6">
          신체 스펙과 기상의 융합,<br />
          <span className="bg-gradient-to-r from-amber-400 via-orange-400 to-amber-600 bg-clip-text text-transparent">
            개인 맞춤형 체감 열 부하 가이드
          </span>
        </h1>

        <p className="text-lg text-zinc-400 max-w-2xl mb-12 leading-relaxed">
          키, 몸무게, 체지방률을 바탕으로 기상청 실시간 기후 데이터와 인간공학적 PMV 모델을 분석합니다. 오직 당신만을 위한 정교한 체감 온도 분석과 의류 및 행동 수칙 가이드를 경험해 보세요.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <Link 
            href="/app"
            className="group flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 text-black font-semibold px-8 py-4 rounded-2xl shadow-lg hover:shadow-amber-500/10 transition-all duration-300 transform hover:-translate-y-1 w-full sm:w-auto"
          >
            <span>분석 대시보드 시작하기</span>
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </Link>
          <a
            href="#features"
            className="flex items-center justify-center px-8 py-4 rounded-2xl font-semibold glass border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-900 transition-all w-full sm:w-auto"
          >
            핵심 기술 살펴보기
          </a>
        </div>

        {/* Feature Highlights */}
        <section id="features" className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full mt-24">
          <div className="p-6 rounded-2xl glass-premium text-left flex flex-col justify-between">
            <div className="p-3 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/10 w-fit mb-4">
              <Thermometer className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white mb-2">인간공학적 PMV 모델</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                단순 기온을 넘어 의복량, 대사율, 기류 등을 종합 분석하여 실제 체감하는 열 부하를 지표화합니다.
              </p>
            </div>
          </div>

          <div className="p-6 rounded-2xl glass-premium text-left flex flex-col justify-between">
            <div className="p-3 rounded-xl bg-orange-500/10 text-orange-500 border border-orange-500/10 w-fit mb-4">
              <Cpu className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white mb-2">실시간 초정밀 캐싱</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Supabase 캐시 레이어를 통해 실시간 전국 기상 격자 데이터를 신속하게 매핑하고 레이턴시를 획기적으로 낮춥니다.
              </p>
            </div>
          </div>

          <div className="p-6 rounded-2xl glass-premium text-left flex flex-col justify-between">
            <div className="p-3 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/10 w-fit mb-4">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white mb-2">LLM 컨텍스트 방어</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                프롬프트 인젝션을 완벽히 방어한 백엔드 구조로 오직 연산 데이터에 근거한 무결성 높은 의류 조언을 생성합니다.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-zinc-900 py-8 z-10">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between text-xs text-zinc-500 gap-4">
          <p>© 2026 Thermal Guide. All rights reserved.</p>
          <div className="flex gap-6">
            <a href="#" className="hover:text-zinc-300">개인정보처리방침</a>
            <a href="#" className="hover:text-zinc-300">서비스이용약관</a>
            <a href="#" className="hover:text-zinc-300">기상청 ASOS 연동 정보</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

