import React, { useState } from 'react';
import { WelcomeScreen } from './components/WelcomeScreen';
import { WorkspaceScreen } from './components/WorkspaceScreen';

// 定义应用支持的视图状态
type ViewState = 'welcome' | 'workspace';

export default function App() {
  // 当前视图状态，默认为欢迎页
  const [currentView, setCurrentView] = useState<ViewState>('welcome');

  // 切换到工作台视图
  const handleStart = () => {
    setCurrentView('workspace');
  };

  // 切换回欢迎页（可选，用于测试）
  const handleBack = () => {
    setCurrentView('welcome');
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 font-sans antialiased">
      {/* 根据状态渲染不同的界面 */}
      {currentView === 'welcome' ? (
        <WelcomeScreen onStart={handleStart} />
      ) : (
        <WorkspaceScreen onBack={handleBack} />
      )}
    </div>
  );
}