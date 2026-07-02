// 알람 기준값, 시스템 설정
import React, { useState } from "react"
import { Card } from "../../shared/components/Card";
import { Save, Bell, Shield, Globe, Monitor } from "lucide-react";

function NavItem({ id, icon, label, activeSection, onSelect }) {
    const active = activeSection === id;
    const iconElement = React.createElement(icon, { className: "w-4 h-4" });
    return (
        <button
            type="button"
            onClick={() => onSelect(id)}
            className={`w-full text-left p-3 rounded cursor-pointer flex items-center space-x-3 transition-colors ${
            active ? "bg-gray-100 text-gray-800 font-bold" : "hover:bg-gray-50 text-gray-600"
            }`}
        >
            {iconElement}
            <span>{label}</span>
        </button>
    );
}

// 시스템 설정 화면을 담당한다.
// 왼쪽 메뉴에서 설정 섹션을 선택하고, 오른쪽 영역에 해당 설정 패널을 보여준다.
// 실제 저장 API가 붙기 전까지는 화면 상태 중심으로 동작한다.
export default function SettingsPage() {
    const [activeSection, setActiveSection] = useState("general");
    const [autoBackup, setAutoBackup] = useState(true);
     
        return (
        <div className="p-6 space-y-6 bg-white min-h-screen font-sans">
        <div className="flex justify-between items-center mb-6">
            <div>
            <h1 className="text-2xl font-bold text-gray-800">설정</h1>
            <div className="text-sm text-gray-500">환경설정 및 사용자 기본값</div>
            </div>

            <button
            type="button"
            className="h-10 px-4 bg-gray-900 text-white rounded flex items-center space-x-2 hover:bg-gray-800"
            >
            <Save className="w-4 h-4" />
            <span className="text-sm font-mono">변경사항 저장</span>
            </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Nav */}
            <div className="lg:col-span-1 space-y-1">
            <NavItem id="general" icon={Globe} label="일반" activeSection={activeSection} onSelect={setActiveSection} />
            <NavItem id="notifications" icon={Bell} label="알림" activeSection={activeSection} onSelect={setActiveSection} />
            <NavItem id="security" icon={Shield} label="보안" activeSection={activeSection} onSelect={setActiveSection} />
            <NavItem id="display" icon={Monitor} label="화면" activeSection={activeSection} onSelect={setActiveSection} />
            </div>

            {/* Right Panels */}
            <div className="lg:col-span-2 space-y-6">
            {activeSection === "general" && (
                <>
                <Card title="시스템 기본 설정">
                    <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                        <div className="font-bold text-gray-700 text-sm">시스템 이름</div>
                        <div className="text-xs text-gray-500">대시보드 상단에 표시되는 이름</div>
                        </div>
                        <div className="h-9 w-64 bg-gray-50 border border-gray-200 rounded flex items-center px-3 text-sm text-gray-600 font-mono">
                        역주행 방지 실시간 관제 대시보드
                        </div>
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                        <div>
                        <div className="font-bold text-gray-700 text-sm">언어</div>
                        <div className="text-xs text-gray-500">화면 표시 언어</div>
                        </div>
                        <div className="h-9 w-32 bg-gray-50 border border-gray-200 rounded flex items-center px-3 justify-between">
                        <span className="text-sm text-gray-600">한국어</span>
                        </div>
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                        <div>
                        <div className="font-bold text-gray-700 text-sm">표준 시간대</div>
                        <div className="text-xs text-gray-500">이벤트 시간 표기 기준</div>
                        </div>
                        <div className="h-9 w-48 bg-gray-50 border border-gray-200 rounded flex items-center px-3 justify-between">
                        <span className="text-sm text-gray-600">UTC+09:00 (KST)</span>
                        </div>
                    </div>
                    </div>
                </Card>

                <Card title="데이터 보관 정책">
                    <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                        <div className="font-bold text-gray-700 text-sm">로그 보관 기간</div>
                        <div className="text-xs text-gray-500">다음 기간보다 오래된 로그 자동 삭제</div>
                        </div>
                        <div className="h-9 w-32 bg-gray-50 border border-gray-200 rounded flex items-center px-3 justify-between">
                        <span className="text-sm text-gray-600">30일</span>
                        </div>
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                        <div>
                        <div className="font-bold text-gray-700 text-sm">자동 백업</div>
                        <div className="text-xs text-gray-500">매일 시스템 백업 수행</div>
                        </div>

                        <button
                        type="button"
                        onClick={() => setAutoBackup((v) => !v)}
                        className={`w-12 h-6 rounded-full relative cursor-pointer transition-colors ${
                            autoBackup ? "bg-green-500" : "bg-gray-300"
                        }`}
                        aria-label="자동 백업 토글"
                        >
                        <div
                            className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${
                            autoBackup ? "right-1" : "left-1"
                            }`}
                        />
                        </button>
                    </div>
                    </div>
                </Card>
                </>
            )}

            {activeSection === "notifications" && (
                <Card title="알림 설정">
                <div className="text-sm text-gray-600">
                    알림 설정 UI는 아직 목업 상태야. (이메일/문자/대시보드 팝업 등)
                </div>
                </Card>
            )}

            {activeSection === "security" && (
                <Card title="보안 설정">
                <div className="text-sm text-gray-600">
                    보안 설정 UI는 아직 목업 상태야. (계정, 권한, 접근 로그 등)
                </div>
                </Card>
            )}

            {activeSection === "display" && (
                <Card title="화면 설정">
                <div className="text-sm text-gray-600">
                    화면 설정 UI는 아직 목업 상태야. (다크모드, 글자 크기, 레이아웃 등)
                </div>
                </Card>
            )}
            </div>
        </div>
        </div>
    );
    }
