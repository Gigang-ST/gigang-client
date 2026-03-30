export function MileageRulesContent() {
  return (
    <div className="space-y-5 text-sm">
      <section className="space-y-2">
        <h3 className="font-semibold">종목별 마일리지 환산</h3>
        <div className="rounded-lg bg-muted/50 p-3 space-y-2 text-[13px]">
          <div className="flex justify-between">
            <span>러닝 / 트레일러닝</span>
            <span className="text-muted-foreground">거리(km) + 고도(m) ÷ 100</span>
          </div>
          <div className="flex justify-between">
            <span>자전거</span>
            <span className="text-muted-foreground">거리(km) ÷ 4 + 고도(m) ÷ 100</span>
          </div>
          <div className="flex justify-between">
            <span>수영</span>
            <span className="text-muted-foreground">거리(km) × 3</span>
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold">이벤트 배율</h3>
        <p className="text-muted-foreground leading-relaxed">
          운영진이 지정한 이벤트 기간에는 배율이 적용됩니다.
          <br />
          여러 이벤트가 겹치면 배율이 곱셈으로 중첩됩니다.
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold">월 목표 자동 상향</h3>
        <p className="text-muted-foreground leading-relaxed mb-2">
          목표 달성 시 다음 달 목표가 자동 상향됩니다.
        </p>
        <div className="rounded-lg bg-muted/50 p-3 space-y-1 text-[13px]">
          <div className="flex justify-between">
            <span>50km 미만</span>
            <span className="font-medium">+10km</span>
          </div>
          <div className="flex justify-between">
            <span>50 ~ 100km</span>
            <span className="font-medium">+15km</span>
          </div>
          <div className="flex justify-between">
            <span>100km 이상</span>
            <span className="font-medium">+20km</span>
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold">보증금 & 환급</h3>
        <p className="text-muted-foreground leading-relaxed">
          매월 보증금 10,000원이 차감됩니다.
          <br />
          달성률에 비례하여 환급되며, 이벤트 종료 후 일괄 지급됩니다.
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold">참가비 & 회식비</h3>
        <p className="text-muted-foreground leading-relaxed">
          참가비 20,000원 (싱글렛 보유 시 10,000원).
          <br />
          미환급 보증금 + 1만원이 회식비 풀로 적립되며,
          참여 개월 수에 비례하여 배분됩니다.
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold">기록 수정 규칙</h3>
        <p className="text-muted-foreground leading-relaxed">
          전월 기록은 매월 3일까지만 수정/삭제 가능합니다.
          <br />
          월 목표는 14일까지만 상향 조정할 수 있습니다.
        </p>
      </section>

      <div className="border-t pt-4 space-y-1 text-xs text-muted-foreground">
        <p>마일리지런은 중도 포기가 없습니다. 부상, 이사 등 어떤 사유에도 중도 포기되지 않습니다.</p>
        <p>회식비는 회식에 참여했을 때 회식비로만 지원됩니다. 다른 방법으로 받거나 환급될 수 없습니다.</p>
        <p>회식비가 남는다면 회비로 귀속됩니다.</p>
      </div>
    </div>
  );
}
