"use client";

import { useRef, useState } from "react";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { ChevronLeft } from "lucide-react";
import Confetti from "react-confetti";
import { useForm } from "react-hook-form";

import { dayjs } from "@/lib/dayjs";
import { digitsOnly, formatPhone, isValidPhone } from "@/lib/phone-utils";
import type { PledgeGathering } from "@/lib/queries/onboarding-gatherings";
import {
  AVG_PACE_CODES,
  JOIN_PURP_CODES,
  JOIN_SRC_CODES,
  type OnboardingProfileValues,
} from "@/lib/validations/member";
import { cn } from "@/lib/utils";

import {
  onboardingCheckPhone,
  onboardingCreateMember,
  onboardingLinkExistingMember,
} from "@/app/actions/onboarding-mem-v2";

import { AppTabsGuide } from "@/components/auth/app-tabs-guide";
import { AttendancePledgeStep } from "@/components/auth/attendance-pledge-step";
import { isDevModeEnabled } from "@/lib/dev-mode";
import { SignupProgress } from "@/components/auth/signup-progress";
import { StationCombobox } from "@/components/auth/station-combobox";
import { Caption, H2 } from "@/components/common/typography";
import { PwaInstallPrompt } from "@/components/pwa-install-prompt";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type MemberOnboardingFormProps = {
  userId: string;
  provider: "kakao" | "google";
  email?: string | null;
  initialAvatarUrl?: string | null;
  initialFullName?: string;
  kakaoChatPassword?: string;
  /** 6단계(참석 약속) 모임 선택 화면에 보여줄 열린 모임 목록 — 서버(onboarding/page.tsx)에서 조회해 전달 */
  gatherings: PledgeGathering[];
};

type MemberOnboardingValues = {
  fullName: string;
  gender: "" | "male" | "female";
  birthday: string;
  emailInput: string;
};

/** 러닝 프로필(4단계) + 가입 목적(5단계) 입력값. 6단계 완료 시점에 한 번에 제출한다. */
type WizardProfileState = {
  nearStnNm: string | null;
  avgRunDistKmInput: string;
  avgPaceCd: (typeof AVG_PACE_CODES)[number] | null;
  joinPurpCds: (typeof JOIN_PURP_CODES)[number][];
  joinPurpTxt: string;
  joinSrcCd: (typeof JOIN_SRC_CODES)[number] | null;
  joinSrcTxt: string;
};

const initialWizardProfile: WizardProfileState = {
  nearStnNm: null,
  avgRunDistKmInput: "",
  avgPaceCd: null,
  joinPurpCds: [],
  joinPurpTxt: "",
  joinSrcCd: null,
  joinSrcTxt: "",
};

/** 평균 페이스 코드 → 라벨. 4단계 Select와 완료 화면 개인화 멘트가 공유(설계 §3.4). */
const PACE_LABELS: Record<(typeof AVG_PACE_CODES)[number], string> = {
  P330: "3'30\"",
  P400: "4'00\"",
  P430: "4'30\"",
  P500: "5'00\"",
  P530: "5'30\"",
  P600: "6'00\"",
  P630: "6'30\"",
  P700: "7'00\"",
  P730: "7'30\"",
  P730_OVER: "7'30\"보다 여유롭게",
  UNKNOWN: "잘 모르겠어요",
};

/** 가입 목적 칩 라벨 (설계 §3.1) */
const JOIN_PURP_LABELS: Record<(typeof JOIN_PURP_CODES)[number], string> = {
  RUN_MATE: "같이 달릴 사람이 필요해요",
  COACH: "자세·훈련 코칭을 받고 싶어요",
  TRAINING: "인터벌 같은 훈련을 같이 하고 싶어요",
  NEW_SPORT: "안 해본 운동을 해보고 싶어요",
  RACE: "대회에 같이 나가고 싶어요",
  FRIENDS: "새로운 친구를 만나고 싶어요",
  HABIT: "운동 습관을 만들고 싶어요",
};

/** 유입 경로 칩 라벨 (설계 §3.5) */
const JOIN_SRC_LABELS: Record<(typeof JOIN_SRC_CODES)[number], string> = {
  FRIEND: "지인 소개",
  INSTA: "인스타그램",
  SOMOIM: "소모임",
  DAANGN: "당근",
  ETC: "기타",
};

const KAKAO_OPEN_CHAT_URL = "https://open.kakao.com/o/grnMFGng";

export function MemberOnboardingForm({
  userId: _userId,
  provider,
  email,
  initialAvatarUrl,
  initialFullName = "",
  kakaoChatPassword,
  gatherings,
}: MemberOnboardingFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next") ?? "/";
  const safeNext =
    nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";
  const form = useForm<MemberOnboardingValues>({
    defaultValues: {
      fullName: initialFullName,
      gender: "",
      birthday: "",
      emailInput: email ?? "",
    },
  });

  // 개발 모드에서 ?preview=success 로 완료 화면을 바로 띄운다(실제 가입 없이 UI 확인용).
  // 운영에서는 isDevModeEnabled()가 false라 무시된다.
  const previewSuccess =
    isDevModeEnabled() && searchParams.get("preview") === "success";

  const [stage, setStage] = useState<
    | "phone"
    | "details"
    | "profile"
    | "purpose"
    | "pledge"
    | "pending"
    | "success"
  >(previewSuccess ? "success" : "phone");
  // 연락처는 위저드 공용 RHF 폼과 완전히 분리해 "확정값" 문자열로만 보관한다.
  // phone 단계(PhoneStep)가 자체 로컬 상태로 입력을 받고, 검증·기존회원 확인을
  // 통과한 값만 여기로 올라온다. 이후 단계에선 표시 전용 prop — 폼 필드로 존재하지
  // 않으므로 자동완성 오염이나 단계 왕복 시 값 유실/잔상이 구조적으로 불가능하다.
  const [confirmedPhone, setConfirmedPhone] = useState("");
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneServerError, setPhoneServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [wizardProfile, setWizardProfile] = useState<WizardProfileState>(
    initialWizardProfile,
  );
  const [purposeErrors, setPurposeErrors] = useState<{
    joinSrcCd?: string;
    joinPurpCds?: string;
  }>({});
  const [result, setResult] = useState<{
    pledgeGthrId: string | null;
    pledgeJoined?: boolean;
  } | null>(null);
  // 5단계 검증 실패 시 첫 에러 섹션으로 스크롤하기 위한 ref (§8)
  const joinSrcSectionRef = useRef<HTMLDivElement | null>(null);
  const joinPurpSectionRef = useRef<HTMLDivElement | null>(null);

  /**
   * PhoneStep에서 형식 검증까지 끝난 연락처를 받아 기존회원 확인을 수행한다.
   * new → 확정값 저장 후 details로, pending → 안내 화면, 기존회원 → 계정 연동 후 이동.
   */
  const handlePhoneConfirm = async (phoneValue: string) => {
    setPhoneLoading(true);
    setPhoneServerError(null);

    try {
      const check = await onboardingCheckPhone(phoneValue);

      if (!check.ok) {
        setPhoneServerError(check.message);
        return;
      }

      if (check.kind === "new") {
        setConfirmedPhone(phoneValue);
        setStage("details");
        return;
      }
      if (check.kind === "pending") {
        setStage("pending");
        return;
      }

      const link = await onboardingLinkExistingMember({
        memId: check.memId,
        provider,
        initialAvatarUrl,
      });
      if (!link.ok) {
        setPhoneServerError(link.message ?? "연동에 실패했습니다.");
        return;
      }
      router.replace(safeNext);
    } catch {
      setPhoneServerError(
        "네트워크 문제로 확인에 실패했습니다. 잠시 후 다시 시도해 주세요.",
      );
    } finally {
      setPhoneLoading(false);
    }
  };

  /**
   * 3단계 "다음" — 이 단계에서 보이는 필드(이름·성별·생년월일)만 검증하고 4단계로.
   * form.handleSubmit(폼 전체 검증)은 쓰지 않는다 — 다른 단계의 숨은 필드까지 걸려
   * 엉뚱하게 막히기 때문. 값은 getValues로 폼 상태에서 직접 읽는다. 회원 생성은 6단계.
   * (연락처는 phone 단계에서 이미 검증·확정된 confirmedPhone이라 여기선 다루지 않음.)
   */
  const handleDetailsNext = () => {
    const values = form.getValues();
    form.clearErrors();

    const name = values.fullName.trim();
    if (!name) {
      form.setError("fullName", { message: "이름을 입력해 주세요." });
      return;
    }
    if (!/^[가-힣]{2,5}$/.test(name)) {
      form.setError("fullName", {
        message: /^[가-힣]+$/.test(name)
          ? "이름은 2~5자로 입력해 주세요"
          : "한글 이름만 입력해 주세요",
      });
      return;
    }
    if (values.gender !== "male" && values.gender !== "female") {
      form.setError("gender", { message: "성별을 선택해 주세요." });
      return;
    }
    if (!values.birthday) {
      form.setError("birthday", { message: "생년월일을 입력해 주세요." });
      return;
    }
    setStage("profile");
  };

  /**
   * 5단계 검증: 유입 경로 1개 + 목적 칩 1개 이상 필수.
   * 검증 통과 시 null, 실패 시 에러 객체를 반환(호출부에서 첫 에러 위치로 스크롤하기 위함).
   */
  const validatePurpose = () => {
    const errors: typeof purposeErrors = {};
    if (!wizardProfile.joinSrcCd) {
      errors.joinSrcCd = "기강을 어떻게 알게 되셨는지 선택해 주세요.";
    } else if (
      wizardProfile.joinSrcCd === "ETC" &&
      !wizardProfile.joinSrcTxt.trim()
    ) {
      errors.joinSrcCd = "어떻게 알게 되셨는지 직접 입력해 주세요.";
    }
    if (wizardProfile.joinPurpCds.length === 0) {
      errors.joinPurpCds = "1개 이상 선택해 주세요.";
    }
    setPurposeErrors(errors);
    return Object.keys(errors).length === 0 ? null : errors;
  };

  /** 6단계 완료(참석 약속) — 지금까지 모은 값으로 회원 생성을 1회 실행 */
  const handlePledgeComplete = async (pledgeGthrId: string | null) => {
    const values = form.getValues();
    const emailValue = (email ?? values.emailInput.trim()) || null;

    const distTrimmed = wizardProfile.avgRunDistKmInput.trim();
    const parsedDist = distTrimmed ? Number(distTrimmed) : null;

    const onbdProfile: OnboardingProfileValues = {
      nearStnNm: wizardProfile.nearStnNm,
      avgRunDistKm:
        parsedDist !== null && Number.isFinite(parsedDist) ? parsedDist : null,
      avgPaceCd: wizardProfile.avgPaceCd,
      joinPurpCds: wizardProfile.joinPurpCds,
      joinPurpTxt: wizardProfile.joinPurpTxt.trim() || null,
      // validatePurpose에서 필수 검증하므로 이 시점엔 항상 값이 있음
      joinSrcCd: wizardProfile.joinSrcCd ?? "ETC",
      joinSrcTxt: wizardProfile.joinSrcTxt.trim() || null,
    };

    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await onboardingCreateMember({
        fullName: values.fullName,
        gender: values.gender as "male" | "female",
        birthday: values.birthday,
        phoneDigits: digitsOnly(confirmedPhone),
        email: emailValue,
        // 계좌는 온보딩에서 받지 않는다(설계 §2.1) — 완료 화면 "/profile/bank" 링크로 유도
        bankName: null,
        bankAccountRaw: "",
        provider,
        initialAvatarUrl,
        onbdProfile,
        pledgeGthrId,
      });

      if (!res.ok) {
        setSubmitError(res.message ?? "가입에 실패했습니다.");
        return;
      }

      if (res.alreadyRegistered) {
        router.replace(safeNext);
        return;
      }

      setResult({ pledgeGthrId, pledgeJoined: res.pledgeJoined });
      setStage("success");
    } catch {
      setSubmitError(
        "네트워크 문제로 가입에 실패했습니다. 잠시 후 다시 시도해 주세요.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (stage === "success") {
    const paceMsg = !wizardProfile.avgPaceCd
      ? "페이스는 같이 뛰다 보면 금방 알게 돼요.\n잘 오셨어요!"
      : wizardProfile.avgPaceCd === "P730_OVER"
        ? "여유로운 페이스 환영이에요.\n기강은 같이 달리는 게 전부예요 🙌"
        : wizardProfile.avgPaceCd === "UNKNOWN"
          ? "페이스는 같이 뛰다 보면 금방 알게 돼요.\n잘 오셨어요!"
          : `${PACE_LABELS[wizardProfile.avgPaceCd]} 페이스요? 기강이랑 딱 맞는 속도예요.\n첫 모임에서 봬요 🔥`;

    const pledgedGathering =
      result?.pledgeJoined && result.pledgeGthrId
        ? gatherings.find((g) => g.gthrId === result.pledgeGthrId)
        : null;

    return (
      <div className="flex flex-col gap-6">
        <SignupProgress step={6} done />
        <Confetti
          width={typeof window !== "undefined" ? window.innerWidth : 400}
          height={typeof window !== "undefined" ? window.innerHeight : 800}
          recycle={false}
          numberOfPieces={500}
          gravity={0.25}
          initialVelocityY={{ min: -30, max: -10 }}
          initialVelocityX={{ min: -10, max: 10 }}
          confettiSource={{
            x: typeof window !== "undefined" ? window.innerWidth / 2 - 50 : 150,
            y: typeof window !== "undefined" ? window.innerHeight : 800,
            w: 100,
            h: 0,
          }}
          style={{ position: "fixed", top: 0, left: 0, zIndex: 50 }}
        />
        <Card className="border-border bg-card shadow-sm">
          <CardContent className="flex flex-col items-center gap-5 pt-8 pb-8">
            <div className="text-center">
              <h3 className="text-2xl font-bold">가입 완료! 🎉</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">
                기강에 오신 것을 환영합니다.
              </p>
              <p className="mt-3 whitespace-pre-line text-sm font-medium text-foreground">
                {paceMsg}
              </p>
              {result?.pledgeGthrId ? (
                pledgedGathering ? (
                  <p className="mt-1.5 text-sm font-semibold text-primary">
                    {dayjs(pledgedGathering.sttAt).format("M/D(ddd)")}{" "}
                    {pledgedGathering.gthrNm}에서 봬요! 참가 신청 완료됐어요 ✅
                  </p>
                ) : (
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    모임 신청이 마감됐어요 — 홈 일정에서 다른 모임을 신청해
                    주세요
                  </p>
                )
              ) : null}
            </div>

            {kakaoChatPassword ? (
              <div className="w-full rounded-2xl border border-border bg-secondary/50 px-5 py-4 text-center">
                <p className="text-xs text-muted-foreground">
                  오픈채팅 비밀번호
                </p>
                <p className="mt-1 text-2xl font-bold tracking-widest text-foreground">
                  {kakaoChatPassword}
                </p>
              </div>
            ) : null}

            <AppTabsGuide />

            <div className="flex w-full flex-col gap-2">
              <a
                href={KAKAO_OPEN_CHAT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#FEE500] text-[15px] font-bold text-neutral-900 shadow-sm transition-colors hover:bg-[#fdd835]"
              >
                💬 카카오톡 오픈채팅 참여하기
              </a>
              <Link
                href="/"
                className="flex h-12 items-center justify-center rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground"
              >
                일정 보러 가기
              </Link>
              <PwaInstallPrompt variant="inline" />
              <Link
                href="/profile/bank"
                className="text-center text-xs font-medium text-muted-foreground underline"
              >
                계좌 정보 지금 등록하기
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (stage === "pledge") {
    return (
      <div className="flex flex-col gap-6">
        <SignupProgress step={6} />
        <Card className="bg-card border-border shadow-sm">
          <CardContent className="pt-6">
            {submitError ? (
              <p className="mb-4 text-sm text-destructive">{submitError}</p>
            ) : null}
            <AttendancePledgeStep
              gatherings={gatherings}
              onComplete={handlePledgeComplete}
              submitting={submitting}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (stage === "profile") {
    return (
      <div className="flex flex-col gap-6">
        <SignupProgress step={4} />
        <Card className="bg-card border-border shadow-sm">
          <CardHeader>
            <H2>러닝 프로필</H2>
            <CardDescription>
              전부 선택 입력이에요. 나중에 프로필에서도 수정할 수 있어요.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <Label>가까운 역 (선택)</Label>
                <StationCombobox
                  value={wizardProfile.nearStnNm}
                  onChange={(v) =>
                    setWizardProfile((prev) => ({ ...prev, nearStnNm: v }))
                  }
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label>평균 러닝 거리 (선택)</Label>
                <div className="relative">
                  <Input
                    type="text"
                    inputMode="decimal"
                    placeholder="예: 5"
                    value={wizardProfile.avgRunDistKmInput}
                    onChange={(e) => {
                      const next = e.target.value;
                      if (!/^\d*\.?\d*$/.test(next)) return;
                      setWizardProfile((prev) => ({
                        ...prev,
                        avgRunDistKmInput: next,
                      }));
                    }}
                    className="h-12 rounded-xl border-[1.5px] pr-10 text-[15px]"
                  />
                  <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    km
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label>평균 페이스 (선택)</Label>
                <Select
                  value={wizardProfile.avgPaceCd ?? ""}
                  onValueChange={(v) =>
                    setWizardProfile((prev) => ({
                      ...prev,
                      avgPaceCd: v as (typeof AVG_PACE_CODES)[number],
                    }))
                  }
                >
                  <SelectTrigger className="h-12 rounded-xl border-[1.5px] text-[15px]">
                    <SelectValue placeholder="페이스 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {AVG_PACE_CODES.map((code) => (
                      <SelectItem key={code} value={code}>
                        {PACE_LABELS[code]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setStage("details")}
                >
                  <ChevronLeft className="size-4" />
                  이전
                </Button>
                {/* 4단계는 전부 선택 입력 — 하나도 안 채우면 "건너뛰기", 하나라도
                    채우면 "다음"으로 라벨만 바뀐다. 동작은 동일(다음 단계로 이동). */}
                <Button
                  type="button"
                  className="flex-[2]"
                  onClick={() => setStage("purpose")}
                >
                  {wizardProfile.nearStnNm ||
                  wizardProfile.avgRunDistKmInput.trim() ||
                  wizardProfile.avgPaceCd
                    ? "다음"
                    : "건너뛰기"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (stage === "purpose") {
    return (
      <div className="flex flex-col gap-6">
        <SignupProgress step={5} />
        <Card className="bg-card border-border shadow-sm">
          <CardHeader>
            <H2>가입 목적</H2>
            <CardDescription>
              운영진이 참고할게요. 편하게 답해주세요.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-6">
              <div
                ref={joinSrcSectionRef}
                className="flex flex-col gap-2 scroll-mt-6"
              >
                <Label>기강은 어떻게 알게 되셨어요?</Label>
                <div className="flex flex-wrap gap-2">
                  {JOIN_SRC_CODES.map((code) => (
                    <Chip
                      key={code}
                      selected={wizardProfile.joinSrcCd === code}
                      onClick={() =>
                        setWizardProfile((prev) => ({
                          ...prev,
                          joinSrcCd: code,
                        }))
                      }
                    >
                      {JOIN_SRC_LABELS[code]}
                    </Chip>
                  ))}
                </div>
                {wizardProfile.joinSrcCd === "ETC" ? (
                  <Input
                    placeholder="예: 유튜브 보고 왔어요"
                    value={wizardProfile.joinSrcTxt}
                    onChange={(e) =>
                      setWizardProfile((prev) => ({
                        ...prev,
                        joinSrcTxt: e.target.value,
                      }))
                    }
                    className="h-12 rounded-xl border-[1.5px] text-[15px]"
                  />
                ) : null}
                {purposeErrors.joinSrcCd ? (
                  <Caption className="text-destructive">
                    {purposeErrors.joinSrcCd}
                  </Caption>
                ) : null}
              </div>

              <div
                ref={joinPurpSectionRef}
                className="flex flex-col gap-2 scroll-mt-6"
              >
                <Label>기강에서 뭘 하고 싶으세요?</Label>
                <div className="flex flex-wrap gap-2">
                  {JOIN_PURP_CODES.map((code) => {
                    const selected = wizardProfile.joinPurpCds.includes(code);
                    return (
                      <Chip
                        key={code}
                        selected={selected}
                        onClick={() =>
                          setWizardProfile((prev) => ({
                            ...prev,
                            joinPurpCds: selected
                              ? prev.joinPurpCds.filter((c) => c !== code)
                              : [...prev.joinPurpCds, code],
                          }))
                        }
                      >
                        {JOIN_PURP_LABELS[code]}
                      </Chip>
                    );
                  })}
                </div>
                {purposeErrors.joinPurpCds ? (
                  <Caption className="text-destructive">
                    {purposeErrors.joinPurpCds}
                  </Caption>
                ) : null}
              </div>

              <div className="flex flex-col gap-2">
                <Label>더 하고 싶은 말이 있다면 (선택)</Label>
                <Textarea
                  placeholder="자유롭게 남겨주세요"
                  value={wizardProfile.joinPurpTxt}
                  onChange={(e) =>
                    setWizardProfile((prev) => ({
                      ...prev,
                      joinPurpTxt: e.target.value,
                    }))
                  }
                  className="rounded-xl border-[1.5px] text-[15px]"
                />
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setStage("profile")}
                >
                  <ChevronLeft className="size-4" />
                  이전
                </Button>
                <Button
                  type="button"
                  className="flex-[2]"
                  onClick={() => {
                    const errors = validatePurpose();
                    if (errors === null) {
                      setStage("pledge");
                      return;
                    }
                    const target = errors.joinSrcCd
                      ? joinSrcSectionRef.current
                      : joinPurpSectionRef.current;
                    target?.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    });
                  }}
                >
                  다음
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (stage === "pending") {
    return (
      <div className="flex flex-col gap-6">
        <SignupProgress step={3} />
        <Card className="bg-card border-border shadow-sm">
          <CardHeader>
            <H2>회원 정보 입력</H2>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4 text-center">
              <p className="text-sm text-muted-foreground">
                재가입 신청이 접수되었습니다.
                <br />
                관리자 승인 후 이용 가능합니다.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (stage === "phone") {
    return (
      <PhoneStep
        initialPhone={confirmedPhone}
        loading={phoneLoading}
        serverError={phoneServerError}
        onSubmit={handlePhoneConfirm}
      />
    );
  }

  // details 단계 — 이 폼은 이름·성별·생년월일·이메일만 담당한다.
  return (
    <div className={cn("flex flex-col gap-6")}>
      <SignupProgress step={3} />
      <Card className="bg-card border-border shadow-sm">
        <CardHeader>
          <H2>회원 정보 입력</H2>
          <CardDescription>
            가입에 필요한 기본 정보를 입력해 주세요.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form
              onSubmit={(e) => {
                // form.handleSubmit(전체 필드 검증)은 쓰지 않는다 — 이 단계에서 안
                // 보이는 필드 룰까지 걸려 엉뚱하게 막히기 때문. handleDetailsNext가
                // 보이는 필드만 직접 검증한다. Enter 제출도 같은 경로.
                e.preventDefault();
                handleDetailsNext();
              }}
            >
              <div className="flex flex-col gap-6">
                <FormField
                  control={form.control}
                  name="fullName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>이름</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          autoComplete="name"
                          placeholder="홍길동 (성+이름 전체)"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="gender"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>성별</FormLabel>
                      <FormControl>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="성별 선택" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="male">남성</SelectItem>
                            <SelectItem value="female">여성</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="birthday"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>생년월일</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          min="1986-01-01"
                          max="2008-12-31"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {/* 연락처: phone 단계에서 확정된 confirmedPhone을 표시만 한다.
                    RHF 필드가 아닌 단순 prop 표시라 자동완성·단계 왕복의 영향을
                    받지 않는다. 수정은 "번호 다시 입력"으로 phone 단계에 돌아가서. */}
                <div className="flex flex-col gap-2">
                  <Label>연락처</Label>
                  <Input
                    type="tel"
                    value={confirmedPhone}
                    readOnly
                    tabIndex={-1}
                    className="bg-muted text-muted-foreground"
                  />
                </div>
                {!email ? (
                  <FormField
                    control={form.control}
                    name="emailInput"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>이메일 (선택)</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="email"
                            autoComplete="email"
                            placeholder="example@email.com (선택)"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : null}
                <div className="flex flex-col gap-2">
                  <Button type="submit" className="w-full">
                    다음
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    onClick={() => {
                      form.clearErrors();
                      setStage("phone");
                    }}
                  >
                    번호 다시 입력
                  </Button>
                </div>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * 1단계(연락처 확인) 화면. 위저드 공용 RHF 폼과 완전히 분리된 자체 로컬 상태로
 * 동작한다 — 단계 전환 시 컴포넌트가 통째로 마운트/언마운트되므로 다른 단계의
 * 필드와 DOM 입력 노드를 절대 공유하지 않고(React 재사용 차단), 자동완성 잔상이나
 * 값 유실이 구조적으로 발생하지 않는다.
 * 제출 시 값은 항상 DOM(inputRef)에서 직접 읽는다 — 일부 모바일 브라우저/웹뷰의
 * 자동완성이 change 이벤트 없이 값만 써 넣어도, 화면에 보이는 값 그대로 검증된다.
 */
function PhoneStep({
  initialPhone,
  loading,
  serverError,
  onSubmit,
}: {
  initialPhone: string;
  loading: boolean;
  serverError: string | null;
  onSubmit: (phone: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [phone, setPhone] = useState(initialPhone);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = (inputRef.current?.value ?? phone).trim();
    const value = formatPhone(raw);
    if (!value) {
      setError("연락처를 입력해 주세요.");
      return;
    }
    if (!isValidPhone(value)) {
      setError("010으로 시작하는 11자리 번호를 입력해 주세요.");
      return;
    }
    setPhone(value);
    setError(null);
    onSubmit(value);
  };

  return (
    <div className="flex flex-col gap-6">
      <SignupProgress step={3} />
      <Card className="bg-card border-border shadow-sm">
        <CardHeader>
          <H2>회원 정보 입력</H2>
          <CardDescription>
            기존 회원인지 확인하기 위해 연락처를 입력해 주세요.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <Label htmlFor="onboarding-phone">연락처</Label>
              <Input
                ref={inputRef}
                id="onboarding-phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="010-0000-0000"
                value={phone}
                onChange={(e) => {
                  // +82 국가번호·하이픈 등 자동완성 표기를 즉시 010-0000-0000으로 정규화
                  setPhone(formatPhone(e.target.value));
                  if (error) setError(null);
                }}
              />
              {error ? (
                <p className="text-sm text-destructive">{error}</p>
              ) : null}
            </div>
            {serverError ? (
              <p className="text-sm text-destructive">{serverError}</p>
            ) : null}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "확인 중..." : "다음"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

/** 폼 내부 전용 토글 칩 — 공용 컴포넌트로 빼지 않고 로컬로 유지(프로젝트 규칙) */
function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border-[1.5px] px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-foreground hover:bg-secondary",
      )}
    >
      {children}
    </button>
  );
}
