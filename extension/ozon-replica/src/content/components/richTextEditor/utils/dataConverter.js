/**
 * 富文本编辑器数据格式转换工具
 * 用于在我们的数据格式和竞品数据格式之间进行双向转换
 */

/**
 * 我们的组件名称 到 竞品 raShowcase type 的映射
 */
const WIDGET_TO_TYPE_MAP = {
    'raImage': 'roll',
    'raImageText': 'billboard',
    'raLeftRightImage': 'chess',
    'raDoubleImage': 'tileM',
    'raTripleImage': 'tileM',
    'raQuadImage': 'tileM',
    'raIconImage': 'tileSecondary',
    'raTextBlock': 'raTextBlock',
    'list': 'list',
    'raVideo': 'raVideo',
    'raTable': 'raTable'
};

/**
 * 竞品 raShowcase type 到 我们的组件名称的映射
 */
const TYPE_TO_WIDGET_MAP = {
    'roll': 'raImage',
    'billboard': 'raImageText',
    'chess': 'raLeftRightImage',
    'tileSecondary': 'raIconImage'
};

/**
 * 根据竞品 widget 结构推断我们编辑器中的组件类型
 * @param {Object} competitorWidget - 竞品 widget
 * @returns {string} 我们的组件名称
 */
function resolveWidgetNameFromCompetitor(competitorWidget) {
    if (!competitorWidget) {
        return 'raImage';
    }

    if (competitorWidget.type === 'tileM') {
        const blockCount = Array.isArray(competitorWidget.blocks) ? competitorWidget.blocks.length : 0;
        if (blockCount === 2) return 'raDoubleImage';
        if (blockCount === 3) return 'raTripleImage';
        return 'raQuadImage';
    }

    return TYPE_TO_WIDGET_MAP[competitorWidget.type] || 'raImage';
}

/**
 * 图片宽度映射：我们的格式 → 竞品格式
 */
const WIDTH_TO_POSITION_MAP = {
    'full': 'width_full',
    'half': 'width_half',
    'third': 'width_one_third',
    'quarter': 'width_one_fourth'
};

/**
 * 图片位置映射：竞品格式 → 我们的格式
 */
const POSITION_TO_WIDTH_MAP = {
    'width_full': 'full',
    'width_half': 'half',
    'width_one_third': 'third',
    'width_one_fourth': 'quarter',
    'to_the_edge': 'full',
    'middle': 'full',
    'fill': 'full'
};

/**
 * 将我们的图片对象转换为竞品格式
 * @param {Object} img - 我们的图片对象
 * @returns {Object} 竞品格式的图片对象
 */
function convertImageToCompetitor(img) {
    if (!img) return null;
    
    const result = {
        src: img.src || '',
        srcMobile: img.srcMobile || '',
        alt: img.alt || ''
    };
    
    // 处理图片位置/宽度
    if (img.width) {
        result.position = WIDTH_TO_POSITION_MAP[img.width] || 'width_full';
    } else if (img.position) {
        result.position = img.position === 'to_the_edge' ? 'to_the_edge' : 'width_full';
    }
    
    if (img.widthMobile) {
        result.positionMobile = WIDTH_TO_POSITION_MAP[img.widthMobile] || 'width_full';
    } else if (img.positionMobile) {
        result.positionMobile = img.positionMobile === 'to_the_edge' ? 'to_the_edge' : 'width_full';
    }
    
    return result;
}

/**
 * 将竞品的图片对象转换为我们的格式
 * @param {Object} img - 竞品的图片对象
 * @param {string} imgLink - 竞品的 imgLink
 * @returns {Object} 我们格式的图片对象
 */
function convertImageFromCompetitor(img, imgLink = '') {
    if (!img) return null;
    
    const result = {
        src: img.src || '',
        srcMobile: img.srcMobile || '',
        alt: img.alt || '',
        link: imgLink || '',
        position: 'to_the_edge',
        positionMobile: 'to_the_edge',
        scale: 100
    };
    
    // 处理图片位置/宽度
    if (img.position) {
        result.width = POSITION_TO_WIDTH_MAP[img.position] || 'full';
        if (img.position === 'to_the_edge' || img.position === 'middle') {
            result.position = img.position;
        }
    }
    
    if (img.positionMobile) {
        result.widthMobile = POSITION_TO_WIDTH_MAP[img.positionMobile] || 'full';
        if (img.positionMobile === 'to_the_edge' || img.positionMobile === 'middle') {
            result.positionMobile = img.positionMobile;
        }
    }
    
    return result;
}

/**
 * 将文本对象转换为竞品格式（保持不变，因为结构基本一致）
 * @param {Object} text - 文本对象
 * @returns {Object} 转换后的文本对象
 */
function convertTextToCompetitor(text) {
    if (!text) return null;
    return JSON.parse(JSON.stringify(text));
}

/**
 * 将竞品的文本对象转换为我们的格式
 * @param {Object} text - 竞品的文本对象
 * @returns {Object} 转换后的文本对象
 */
function convertTextFromCompetitor(text) {
    if (!text) return null;
    return JSON.parse(JSON.stringify(text));
}

/**
 * 将我们的单个 item 转换为竞品的 block
 * @param {Object} item - 我们的 item
 * @param {string} widgetName - 组件名称
 * @param {number} index - 索引
 * @returns {Object} 竞品的 block
 */
function convertItemToBlock(item, widgetName, index = 0) {
    const block = {};
    
    // 处理图片链接
    if (item.img && item.img.link) {
        block.imgLink = item.img.link;
    } else {
        block.imgLink = String(index + 1);
    }
    
    // 处理图片
    if (item.img) {
        block.img = convertImageToCompetitor(item.img);
    }
    
    // 处理标题
    if (item.title) {
        block.title = convertTextToCompetitor(item.title);
    }
    
    // 处理正文
    if (item.text) {
        block.text = convertTextToCompetitor(item.text);
    }
    
    // 处理左右布局
    if (widgetName === 'raLeftRightImage') {
        block.reverse = item.layout === 'right';
    }
    
    return block;
}

/**
 * 将竞品的单个 block 转换为我们的 item
 * @param {Object} block - 竞品的 block
 * @param {string} type - raShowcase 的 type
 * @returns {Object} 我们的 item
 */
function convertBlockToItem(block, type) {
    const item = {};
    
    // 处理图片
    if (block.img) {
        item.img = convertImageFromCompetitor(block.img, block.imgLink);
    }
    
    // 处理标题
    if (block.title) {
        item.title = convertTextFromCompetitor(block.title);
    }
    
    // 处理正文
    if (block.text) {
        item.text = convertTextFromCompetitor(block.text);
    }
    
    // 处理左右布局
    if (type === 'chess') {
        item.layout = block.reverse ? 'right' : 'left';
    }
    
    return item;
}

/**
 * 将我们的单个 widget 转换为竞品格式
 * @param {Object} widget - 我们的 widget
 * @returns {Object} 竞品格式的 widget
 */
function convertWidgetToCompetitor(widget) {
    if (!widget) return null;
    
    const widgetName = widget.widgetName;
    const type = WIDGET_TO_TYPE_MAP[widgetName];
    
    // 如果是不需要转换的组件（raTextBlock, list, raVideo, raTable）
    if (type === widgetName) {
        const result = JSON.parse(JSON.stringify(widget));
        delete result.id;
        return result;
    }
    
    // 处理 raShowcase 类型
    const result = {
        widgetName: 'raShowcase',
        type: type
    };
    
    // 处理 items → blocks
    if (widget.items && Array.isArray(widget.items)) {
        result.blocks = widget.items.map((item, index) => 
            convertItemToBlock(item, widgetName, index)
        );
    }
    
    return result;
}

/**
 * 文本块 theme 统一到竞品枚举（兼容此前误写入的 blue / blueBorder / gray）
 * @param {Object} widget - 组件对象
 * @returns {Object}
 */
function normalizeRaTextBlockTheme(widget) {
    if (!widget || widget.widgetName !== 'raTextBlock') {
        return widget;
    }
    const legacyToCompetitor = {
        blue: 'primary',
        blueBorder: 'secondary',
        gray: 'tertiary'
    };
    const t = widget.theme;
    if (t && legacyToCompetitor[t]) {
        return { ...widget, theme: legacyToCompetitor[t] };
    }
    return widget;
}

/**
 * 将竞品的单个 widget 转换为我们的格式
 * @param {Object} competitorWidget - 竞品的 widget
 * @returns {Object} 我们格式的 widget
 */
function convertWidgetFromCompetitor(competitorWidget) {
    if (!competitorWidget) return null;
    
    // 生成唯一 ID
    const id = Date.now() + Math.random();
    
    // 如果不是 raShowcase 组件
    if (competitorWidget.widgetName !== 'raShowcase') {
        const result = JSON.parse(JSON.stringify(competitorWidget));
        result.id = id;
        return normalizeRaTextBlockTheme(result);
    }
    
    // 处理 raShowcase 组件
    const type = competitorWidget.type;
    const widgetName = resolveWidgetNameFromCompetitor(competitorWidget);
    
    const result = {
        id: id,
        widgetName: widgetName
    };
    
    // 处理 blocks → items
    if (competitorWidget.blocks && Array.isArray(competitorWidget.blocks)) {
        result.items = competitorWidget.blocks.map(block => 
            convertBlockToItem(block, type)
        );
    }
    
    return result;
}

/**
 * 将我们的完整数据格式转换为竞品格式
 * @param {Object} ourData - 我们的数据格式
 * @returns {Object} 竞品格式的数据
 */
export function convertToCompetitorFormat(ourData) {
    if (!ourData) return null;
    
    const result = {
        content: [],
        version: 0.3
    };
    
    if (ourData.widgets && Array.isArray(ourData.widgets)) {
        result.content = ourData.widgets.map(widget => 
            convertWidgetToCompetitor(widget)
        ).filter(Boolean);
    }
    
    return result;
}

/**
 * 将竞品格式的数据转换为我们的格式
 * @param {Object} competitorData - 竞品格式的数据
 * @returns {Object} 我们的数据格式
 */
export function convertFromCompetitorFormat(competitorData) {
    if (!competitorData) return null;
    
    const result = {
        widgets: [],
        version: 0.3
    };
    
    if (competitorData.content && Array.isArray(competitorData.content)) {
        result.widgets = competitorData.content.map(widget => 
            convertWidgetFromCompetitor(widget)
        ).filter(Boolean);
    }
    
    return result;
}

/**
 * 检测数据格式类型
 * @param {Object} data - 数据对象
 * @returns {string} 'our' | 'competitor' | 'unknown'
 */
export function detectDataFormat(data) {
    if (!data) return 'unknown';

    const widgetsLen = Array.isArray(data.widgets) ? data.widgets.length : 0;
    const contentLen = Array.isArray(data.content) ? data.content.length : 0;

    /*
     * 不能仅凭「存在 widgets 数组」判为我们的格式：接口常带 widgets: [] + content: [...]，
     * 若判成 our 会走 convertToCompetitorFormat 得到空 content，精品展 JSON 无法回显。
     */
    if (widgetsLen > 0) {
        return 'our';
    }
    if (contentLen > 0) {
        return 'competitor';
    }
    if (Array.isArray(data.widgets)) {
        return 'our';
    }
    if (Array.isArray(data.content)) {
        return 'competitor';
    }

    return 'unknown';
}

/**
 * 智能转换：自动检测格式并转换为目标格式
 * @param {Object} data - 输入数据
 * @param {string} targetFormat - 目标格式：'our' 或 'competitor'
 * @returns {Object} 转换后的数据
 */
export function smartConvert(data, targetFormat = 'our') {
    if (!data) return null;
    
    const currentFormat = detectDataFormat(data);
    
    if (currentFormat === targetFormat) {
        return data;
    }
    
    if (targetFormat === 'our') {
        return convertFromCompetitorFormat(data);
    } else {
        return convertToCompetitorFormat(data);
    }
}

export default {
    convertWidgetToCompetitor,
    convertWidgetFromCompetitor,
    convertToCompetitorFormat,
    convertFromCompetitorFormat,
    detectDataFormat,
    smartConvert
};
