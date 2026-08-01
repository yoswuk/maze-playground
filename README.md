# 미로 놀이터

아이를 위한 A4 인쇄용 미로 활동지 생성기입니다. 브라우저에서 바로 동작하며 별도의 서버나 데이터베이스가 필요하지 않습니다.

## 기능

- 쉬움, 보통, 어려움, 매우 어려움(32×32)
- 출발은 왼쪽 외곽, 도착은 오른쪽 외곽
- A4 한 장에 미로 1개 또는 2개
- 정답 보기 및 정답지 인쇄
- 브라우저 인쇄 기능을 통한 PDF 저장

## GitHub Pages

저장소의 `main` 브랜치 루트를 Pages 게시 소스로 선택하면 됩니다.

1. **Settings → Pages**로 이동합니다.
2. **Build and deployment → Source**에서 **Deploy from a branch**를 선택합니다.
3. Branch는 `main`, 폴더는 `/(root)`를 선택하고 저장합니다.

## 로컬 실행

정적 파일이므로 `index.html`을 직접 열거나 간단한 HTTP 서버로 실행할 수 있습니다.

```bash
python3 -m http.server 8000
```
