#!/bin/bash

# 公考督学助手后端生产环境启动脚本
# 使用conda环境直接部署

set -e

# 配置变量
PROJECT_DIR="/srv/zhuzhen/MVP_zhuzhen/backend"
CONDA_ENV_PATH="/root/miniconda3/envs/zhuzhen-backend"
PYTHON_PATH="$CONDA_ENV_PATH/bin/python"
UVICORN_PATH="$CONDA_ENV_PATH/bin/uvicorn"
LOG_DIR="/data/zhuzhen/logs"
PID_FILE="/data/zhuzhen/zhuzhen-backend.pid"

# 环境变量
export DATABASE_URL="postgresql+asyncpg://zhuzhen:fog2//W8wSs7qFOk0DuWmINE5wjvU1RntzJrF9xHxjs=@localhost:5432/zhuzhen_db"
export ENVIRONMENT="production"
export DEBUG="false"
export LOG_LEVEL="info"
export LOG_FILE="$LOG_DIR/app.log"
export UPLOAD_DIR="/data/zhuzhen/uploads"
export HOST="0.0.0.0"
export PORT="8000"
export WORKERS="4"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查依赖
check_dependencies() {
    log_info "检查依赖..."
    
    # 检查conda环境
    if [ ! -d "$CONDA_ENV_PATH" ]; then
        log_error "Conda环境不存在: $CONDA_ENV_PATH"
        exit 1
    fi
    
    # 检查Python
    if [ ! -f "$PYTHON_PATH" ]; then
        log_error "Python不存在: $PYTHON_PATH"
        exit 1
    fi
    
    # 检查项目目录
    if [ ! -d "$PROJECT_DIR" ]; then
        log_error "项目目录不存在: $PROJECT_DIR"
        exit 1
    fi
    
    # 检查PostgreSQL
    if ! systemctl is-active --quiet postgresql; then
        log_warn "PostgreSQL未运行，正在启动..."
        systemctl start postgresql
    fi
    
    log_info "依赖检查完成"
}

# 创建必要目录
create_directories() {
    log_info "创建必要目录..."
    
    mkdir -p "$LOG_DIR"
    mkdir -p "/data/zhuzhen/uploads"
    mkdir -p "/data/zhuzhen/data"
    
    log_info "目录创建完成"
}

# 启动服务
start_service() {
    log_info "启动公考督学助手后端服务..."
    
    cd "$PROJECT_DIR"
    
    # 检查是否已经在运行
    if [ -f "$PID_FILE" ] && kill -0 $(cat "$PID_FILE") 2>/dev/null; then
        log_warn "服务已在运行 (PID: $(cat $PID_FILE))"
        return 0
    fi
    
    # 启动服务
    nohup "$UVICORN_PATH" app.main:app \
        --host "$HOST" \
        --port "$PORT" \
        --workers "$WORKERS" \
        --log-level "$LOG_LEVEL" \
        --access-log \
        > "$LOG_DIR/uvicorn.log" 2>&1 &
    
    # 保存PID
    echo $! > "$PID_FILE"
    
    # 等待服务启动
    sleep 5
    
    # 检查服务是否启动成功
    if kill -0 $(cat "$PID_FILE") 2>/dev/null; then
        log_info "服务启动成功 (PID: $(cat $PID_FILE))"
        log_info "服务地址: http://$HOST:$PORT"
        log_info "API文档: http://$HOST:$PORT/docs"
        log_info "健康检查: http://$HOST:$PORT/health"
    else
        log_error "服务启动失败"
        exit 1
    fi
}

# 停止服务
stop_service() {
    log_info "停止公考督学助手后端服务..."
    
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            kill "$PID"
            sleep 3
            if kill -0 "$PID" 2>/dev/null; then
                log_warn "强制停止服务..."
                kill -9 "$PID"
            fi
            log_info "服务已停止"
        else
            log_warn "服务未运行"
        fi
        rm -f "$PID_FILE"
    else
        log_warn "PID文件不存在"
    fi
}

# 重启服务
restart_service() {
    log_info "重启公考督学助手后端服务..."
    stop_service
    sleep 2
    start_service
}

# 检查服务状态
status_service() {
    if [ -f "$PID_FILE" ] && kill -0 $(cat "$PID_FILE") 2>/dev/null; then
        PID=$(cat "$PID_FILE")
        log_info "服务正在运行 (PID: $PID)"
        
        # 测试健康检查
        if curl -f -s "http://localhost:$PORT/health" > /dev/null 2>&1; then
            log_info "健康检查: ✅ 正常"
        else
            log_warn "健康检查: ❌ 异常"
        fi
    else
        log_warn "服务未运行"
    fi
}

# 查看日志
view_logs() {
    log_info "查看服务日志..."
    if [ -f "$LOG_DIR/uvicorn.log" ]; then
        tail -f "$LOG_DIR/uvicorn.log"
    else
        log_warn "日志文件不存在: $LOG_DIR/uvicorn.log"
    fi
}

# 主函数
main() {
    case "${1:-start}" in
        start)
            check_dependencies
            create_directories
            start_service
            ;;
        stop)
            stop_service
            ;;
        restart)
            restart_service
            ;;
        status)
            status_service
            ;;
        logs)
            view_logs
            ;;
        *)
            echo "用法: $0 {start|stop|restart|status|logs}"
            echo ""
            echo "命令说明:"
            echo "  start   - 启动服务"
            echo "  stop    - 停止服务"
            echo "  restart - 重启服务"
            echo "  status  - 查看状态"
            echo "  logs    - 查看日志"
            exit 1
            ;;
    esac
}

# 执行主函数
main "$@"
