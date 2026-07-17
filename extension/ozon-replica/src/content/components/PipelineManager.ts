import { reactive } from 'vue'

// 进度条步骤类型（原 ProgressBar 导出，供父组件与工作台共用）
export type ProgressStep = {
    name: string
    status: 'pending' | 'active' | 'completed' | 'skipped'
}

// 步骤枚举
export const PipelineStep = {
    FETCH_RAW_DATA: 1,      // 原始数据获取
    FETCH_CATEGORY: 2,      // AI智选类目获取
    WAIT_EXECUTION: 3,      // 等待开始执行
    FETCH_ATTRIBUTES: 4,    // 类目特征获取
    GENERATE_AI: 5,         // AI智能体输出
    TRANSLATE_IMAGES: 6,    // 图片翻译
    REFINE_IMAGES: 7,       // AI改图
    IMAGERICHCONTENT: 8,    // 同步富内容
    SUBMIT: 9               // 执行上传
} as const

// 步骤值类型
export type PipelineStepValue = typeof PipelineStep[keyof typeof PipelineStep]

// 步骤状态类型
export type StepStatus = 'pending' | 'active' | 'completed' | 'skipped'

// PipelineManager 类：管理执行管道状态
export class PipelineManager {
    // 状态存储
    private stepStates: Map<PipelineStepValue, StepStatus>
    
    // 步骤名称映射
    private stepNames: Record<PipelineStepValue, string>
    
    // 响应式状态（使用 reactive 使其可被 Vue 追踪）
    private state = reactive({
        currentStep: null as PipelineStepValue | null,
        progressText: '等待开始' as string
    })
    
    // 响应式进度数据（使用 reactive 使其可被 Vue 追踪）
    private progressData = reactive({
        steps: [] as ProgressStep[]
    })
    
    constructor() {
        this.stepStates = new Map()
        this.stepNames = {
            [PipelineStep.FETCH_RAW_DATA]: '原始数据获取',
            [PipelineStep.FETCH_CATEGORY]: 'AI智选类目获取',
            [PipelineStep.WAIT_EXECUTION]: '等待启动',
            [PipelineStep.FETCH_ATTRIBUTES]: '类目特征获取',
            [PipelineStep.GENERATE_AI]: 'AI智能体输出',
            [PipelineStep.TRANSLATE_IMAGES]: '图片翻译',
            [PipelineStep.REFINE_IMAGES]: 'AI改图',
            [PipelineStep.IMAGERICHCONTENT]: '同步富内容',
            [PipelineStep.SUBMIT]: '执行上传'
        } as Record<PipelineStepValue, string>
        // 初始化所有步骤为 pending
        (Object.values(PipelineStep) as PipelineStepValue[]).forEach((step: PipelineStepValue) => {
            this.stepStates.set(step, 'pending')
        })
        // 初始化进度数据
        this._updateProgressData()
    }
    
    // 更新步骤状态
    updateStage(step: PipelineStepValue, status: StepStatus, progressText?: string): void {
        this.stepStates.set(step, status)
        if (status === 'active') {
            this.state.currentStep = step
        } else if (status === 'completed' || status === 'skipped') {
            // 如果当前步骤已完成或跳过，且这是当前正在执行的步骤，则清除 currentStep
            if (this.state.currentStep === step) {
                this.state.currentStep = null
            }
        }
        if (progressText) {
            this.state.progressText = progressText
        }
        // 更新响应式进度数据
        this._updateProgressData()
    }
    
    // 设置步骤状态（不改变当前步骤）
    setStepStatus(step: PipelineStepValue, status: StepStatus): void {
        this.stepStates.set(step, status)
        if (status !== 'active' && this.state.currentStep === step) {
            this.state.currentStep = null
        }
        // 更新响应式进度数据
        this._updateProgressData()
    }
    
    // 跳转到指定步骤
    jumpToStage(step: PipelineStepValue, progressText?: string): void {
        // 将指定步骤之前的所有步骤标记为 completed
        (Object.values(PipelineStep) as PipelineStepValue[]).forEach(s => {
            if (s < step) {
                const currentStatus = this.stepStates.get(s)
                if (currentStatus !== 'skipped') {
                    this.stepStates.set(s, 'completed')
                }
            }
        })
        // 将指定步骤设置为 active
        this.updateStage(step, 'active', progressText)
    }
    
    // 获取进度（返回响应式数据的引用）
    getProgress(): ProgressStep[] {
        // 返回响应式数组的引用，这样 Vue 的 computed 可以追踪到变化
        return this.progressData.steps
    }
    
    // 获取响应式进度数据对象（用于 Vue 追踪）
    getProgressData() {
        return this.progressData
    }
    
    // 更新进度数据（内部方法）
    private _updateProgressData(): void {
        this.progressData.steps = [
            PipelineStep.FETCH_RAW_DATA,
            PipelineStep.FETCH_CATEGORY,
            PipelineStep.WAIT_EXECUTION,
            PipelineStep.FETCH_ATTRIBUTES,
            PipelineStep.GENERATE_AI,
            PipelineStep.TRANSLATE_IMAGES,
            PipelineStep.REFINE_IMAGES,
            PipelineStep.IMAGERICHCONTENT,
            PipelineStep.SUBMIT
        ].map(step => ({
            name: this.stepNames[step],
            status: this.stepStates.get(step) || 'pending'
        }))
    }
    
    // 获取当前步骤
    getCurrentStage(): PipelineStepValue | null {
        return this.state.currentStep
    }
    
    // 获取步骤状态
    getStepStatus(step: PipelineStepValue): StepStatus {
        return this.stepStates.get(step) || 'pending'
    }
    
    // 检查是否可以进入指定步骤
    canProceedToStep(step: PipelineStepValue): boolean {
        // 前面的步骤必须完成或跳过
        for (let i = PipelineStep.FETCH_RAW_DATA; i < step; i++) {
            const status = this.stepStates.get(i as PipelineStepValue)
            if (status !== 'completed' && status !== 'skipped') {
                return false
            }
        }
        return true
    }
    
    // 获取进度文本
    getProgressText(): string {
        return this.state.progressText
    }
    
    // 设置进度文本
    setProgressText(text: string): void {
        this.state.progressText = text
    }
    
    // 清除当前激活步骤，但保留现有进度状态
    clearCurrentStage(): void {
        this.state.currentStep = null
    }
    
    // 重置所有状态
    reset(): void {
        (Object.values(PipelineStep) as PipelineStepValue[]).forEach(step => {
            this.stepStates.set(step, 'pending')
        })
        this.state.currentStep = null
        this.state.progressText = '等待开始'
        // 更新响应式进度数据
        this._updateProgressData()
    }
}
