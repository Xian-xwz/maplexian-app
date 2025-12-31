import React from 'react';
import { ArrowRight, Palette } from 'lucide-react';

interface WelcomeScreenProps {
  onStart: () => void;
}

/**
 * 首界面（欢迎页）组件
 * 展示系统标题、简介和开始按钮
 */
export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onStart }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black px-4 text-center">
      
      {/* 装饰性背景元素 */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0 opacity-20">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-purple-600 rounded-full blur-[100px]"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-600 rounded-full blur-[100px]"></div>
      </div>

      <div className="z-10 flex flex-col items-center max-w-2xl animate-fade-in-up">
        {/* Logo/Icon */}
        <div className="mb-8 p-4 bg-gray-800 rounded-full border border-gray-700 shadow-2xl shadow-purple-900/20">
          <Palette className="w-12 h-12 text-purple-400" />
        </div>

        {/* 标题 */}
        <h1 className="text-4xl md:text-6xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400 mb-6 tracking-tight">
          纹身预览系统
        </h1>

        {/* 简介 */}
        <p className="text-lg md:text-xl text-gray-400 mb-10 max-w-lg leading-relaxed">
          上传您的照片，利用先进的图像融合技术，实时预览纹身在您身上的真实效果。
        </p>

        {/* 开始按钮 */}
        <button
          onClick={onStart}
          className="group relative inline-flex items-center justify-center px-8 py-4 font-semibold text-white transition-all duration-200 bg-purple-600 rounded-full hover:bg-purple-700 hover:shadow-lg hover:shadow-purple-500/30 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-600 focus:ring-offset-gray-900"
        >
          <span className="mr-2 text-lg">开始体验</span>
          <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
        </button>

        {/* 底部版权/额外信息 */}
        <div className="mt-20 text-sm text-gray-600">
          © 2024 Tattoo Preview System. Phase 1 Build.
        </div>
      </div>
    </div>
  );
};