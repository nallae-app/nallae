# Android 아이콘 리소스

이 디렉터리의 drawable*, mipmap*, values* 폴더를 Android 프로젝트의 app/src/main/res/에 병합한다.
AndroidManifest.xml의 android:icon은 @mipmap/ic_launcher로 지정한다.
기존 android:roundIcon이 별도 아이콘을 참조한다면 동일한 새 리소스로 바꾼다.

- 기본 전경: 노랑 + 진회색, 배경 #FAF9F6
- night 전경: 노랑 + 흰 도로, 배경 #34373B
- monochrome: 배경 없는 단색 알파 마스크. 색상은 지원 런처가 지정한다.
- Android API 33 이상으로 컴파일해야 monochrome을 사용할 수 있다.
- 테마 아이콘 설정/런처/OS 버전에 따라 실제 표시와 night 리소스 갱신 동작은 달라진다. 실제 기기 검증이 필요하다.
- 현재 PC에는 android/ 프로젝트가 없으므로 이 파일은 패키지에 아직 포함되지 않았다.

공식 문서: https://developer.android.com/develop/ui/compose/system/icon_design_adaptive
재생성: node scripts/build-icons.mjs (npm 의존성 설치 필요).
투명 원본: scripts/assets/logo-cutout.png, logo-cutout-dark.png, logo-cutout-mono.png.
