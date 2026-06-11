interface SDKConfig {
    apiKey: string;
    serverUrl?: string;
    flushIntervalMs?: number;
    flushQueueSize?: number;
    autoCapture?: {
        pageViews?: boolean;
        clicks?: boolean;
        formSubmissions?: boolean;
        changes?: boolean;
        scrollDepth?: boolean;
        rageClicks?: boolean;
        deadClicks?: boolean;
        webVitals?: boolean;
        errors?: boolean;
    };
    defaultTracking?: boolean;
    requireConsent?: boolean;
    crossDomain?: string[];
    sessionReplay?: {
        enabled?: boolean;
        sampleRate?: number;
        serverUrl?: string;
        maskAllInputs?: boolean;
        maskTextSelector?: string;
        blockSelector?: string;
    };
}
interface RevenueOptions {
    price: number;
    quantity?: number;
    productId?: string;
    revenueType?: string;
    currency?: string;
    transactionId?: string;
    properties?: Record<string, unknown>;
}
interface EventOptions {
    userId?: string;
    deviceId?: string;
    sessionId?: string;
    time?: number;
    platform?: string;
    osName?: string;
    osVersion?: string;
    deviceType?: string;
    browser?: string;
    browserVersion?: string;
    country?: string;
    region?: string;
    city?: string;
}
interface IdentifyOperation {
    $set?: Record<string, unknown>;
    $setOnce?: Record<string, unknown>;
    $append?: Record<string, unknown>;
    $unset?: string[];
    $add?: Record<string, number>;
}

declare class InspectUserClient {
    private config;
    private queue;
    private userId;
    private userProperties;
    private groups;
    private flushTimer;
    private deviceId;
    private sessionId;
    private optedOut;
    private backoffMs;
    constructor(config: SDKConfig);
    identify(userId: string, properties?: Record<string, unknown>): void;
    setUserProperties(ops: IdentifyOperation): void;
    track(eventType: string, properties?: Record<string, unknown>, options?: EventOptions): void;
    revenue(r: RevenueOptions): void;
    private flagConfig;
    flags(): Promise<Record<string, {
        enabled: boolean;
        variant: string;
    }>>;
    private evalVariant;
    setOptOut(optOut: boolean): void;
    setConsent(granted: boolean): void;
    logout(): void;
    alias(userId: string): void;
    setGroup(groupType: string, groupName: string | string[]): void;
    private captureAttribution;
    private buildEvent;
    private enqueue;
    private ensureSession;
    flush(useBeacon?: boolean): Promise<void>;
    private requeue;
    private scheduleBackoff;
    reset(): void;
    private startFlushTimer;
    private setupAutoCapture;
    private errSeen;
    private shouldSendErr;
    private setupErrorTracking;
    private vitals;
    private vitalsSent;
    private engagedMs;
    private engageStart;
    private engagePath;
    private accrueEngagement;
    private flushEngagement;
    private setupEngagement;
    private setupWebVitals;
    private detectDeadClick;
    private sessionEnded;
    private setupPageUnload;
}

declare function init(config: SDKConfig): InspectUserClient | null;
declare function track(eventType: string, properties?: Record<string, unknown>, options?: EventOptions): void;
declare function identify(userId: string, properties?: Record<string, unknown>): void;
declare function setUserProperties(ops: IdentifyOperation): void;
declare function revenue(r: RevenueOptions): void;
declare function setGroup(groupType: string, groupName: string | string[]): void;
declare function setOptOut(optOut: boolean): void;
declare function setConsent(granted: boolean): void;
declare function logout(): void;
declare function alias(userId: string): void;
declare function flags(): Promise<Record<string, {
    enabled: boolean;
    variant: string;
}>>;
declare function flush(): Promise<void>;
declare function reset(): void;
declare const _default: {
    init: typeof init;
    track: typeof track;
    identify: typeof identify;
    setUserProperties: typeof setUserProperties;
    revenue: typeof revenue;
    setGroup: typeof setGroup;
    setOptOut: typeof setOptOut;
    setConsent: typeof setConsent;
    logout: typeof logout;
    alias: typeof alias;
    flags: typeof flags;
    flush: typeof flush;
    reset: typeof reset;
};

export { type EventOptions, type IdentifyOperation, InspectUserClient, type RevenueOptions, type SDKConfig, alias, _default as default, flags, flush, identify, init, logout, reset, revenue, setConsent, setGroup, setOptOut, setUserProperties, track };
