"use components";
export function instantiate(getCoreModule, imports, instantiateCore = WebAssembly.instantiate) {
  
  function promiseWithResolvers() {
    if (Promise.withResolvers) {
      return Promise.withResolvers();
    } else {
      let resolve;
      let reject;
      const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    }
  }
  const symbolDispose = Symbol.dispose || Symbol.for('dispose');
  const symbolAsyncIterator = Symbol.asyncIterator;
  const symbolIterator = Symbol.iterator;
  
  const _debugLog = (...args) => {
    if (!globalThis?.process?.env?.JCO_DEBUG) { return; }
    console.debug(...args);
  };
  const ASYNC_DETERMINISM = 'random';
  const GLOBAL_COMPONENT_MEMORY_MAP = new Map();
  const CURRENT_TASK_META = {};
  
  function _getGlobalCurrentTaskMeta(componentIdx) {
    if (componentIdx === null || componentIdx === undefined) {
      throw new Error("missing/invalid component idx");
    }
    const v = CURRENT_TASK_META[componentIdx];
    if (v === undefined || v === null) {
      return undefined;
    }
    return { ...v };
  }
  
  
  function _setGlobalCurrentTaskMeta(args) {
    if (!args) { throw new TypeError('args missing'); }
    if (args.taskID === undefined) { throw new TypeError('missing task ID'); }
    if (args.componentIdx === undefined) { throw new TypeError('missing component idx'); }
    const { taskID, componentIdx } = args;
    return CURRENT_TASK_META[componentIdx] = { taskID, componentIdx };
  }
  
  
  function _withGlobalCurrentTaskMeta(args) {
    _debugLog('[_withGlobalCurrentTaskMeta()] args', args);
    if (!args) { throw new TypeError('args missing'); }
    if (args.taskID === undefined) { throw new TypeError('missing task ID'); }
    if (args.componentIdx === undefined) { throw new TypeError('missing component idx'); }
    if (!args.fn) { throw new TypeError('missing fn'); }
    const { taskID, componentIdx, fn } = args;
    
    try {
      CURRENT_TASK_META[componentIdx] = { taskID, componentIdx };
      return fn();
    } catch (err) {
      _debugLog("error while executing sync callee/callback", {
        ...args,
        err,
      });
      throw err;
    } finally {
      CURRENT_TASK_META[componentIdx] = null;
    }
  }
  
  async function _withGlobalCurrentTaskMetaAsync(args) {
    _debugLog('[_withGlobalCurrentTaskMetaAsync()] args', args);
    if (!args) { throw new TypeError('args missing'); }
    if (args.taskID === undefined) { throw new TypeError('missing task ID'); }
    if (args.componentIdx === undefined) { throw new TypeError('missing component idx'); }
    if (!args.fn) { throw new TypeError('missing fn'); }
    
    const { taskID, componentIdx, fn } = args;
    
    try {
      CURRENT_TASK_META[componentIdx] = { taskID, componentIdx };
      return await fn();
    } catch (err) {
      _debugLog("error while executing async callee/callback", {
        ...args,
        err,
      });
      throw err;
    } finally {
      CURRENT_TASK_META[componentIdx] = null;
    }
  }
  
  async function _clearCurrentTask(args) {
    _debugLog('[_clearCurrentTask()] args', args);
    if (!args) { throw new TypeError('args missing'); }
    if (args.taskID === undefined) { throw new TypeError('missing task ID'); }
    if (args.componentIdx === undefined) { throw new TypeError('missing component idx'); }
    const { taskID, componentIdx } = args;
    
    const meta = CURRENT_TASK_META[componentIdx];
    if (!meta) { throw new Error(`missing current task meta for component idx [${componentIdx}]`); }
    
    if (meta.taskID !== taskID) {
      throw new Error(`task ID [${meta.taskID}] != requested ID [${taskID}]`);
    }
    if (meta.componentIdx !== componentIdx) {
      throw new Error(`component idx [${meta.componentIdx}] != requested idx [${componentIdx}]`);
    }
    
    CURRENT_TASK_META[componentIdx] = null;
  }
  
  function lookupMemoriesForComponent(args) {
    const { componentIdx } = args ?? {};
    if (args.componentIdx === undefined) { throw new TypeError("missing component idx"); }
    
    const metas = GLOBAL_COMPONENT_MEMORY_MAP.get(componentIdx);
    if (!metas) { return []; }
    
    if (args.memoryIdx === undefined) {
      return Object.values(metas);
    }
    
    const meta = metas[args.memoryIdx];
    return meta?.memory;
  }
  
  function registerGlobalMemoryForComponent(args) {
    const { componentIdx, memory, memoryIdx } = args ?? {};
    if (componentIdx === undefined) { throw new TypeError('missing component idx'); }
    if (memory === undefined && memoryIdx === undefined) { throw new TypeError('missing both memory & memory idx'); }
    let inner = GLOBAL_COMPONENT_MEMORY_MAP.get(componentIdx);
    if (!inner) {
      inner = {};
      GLOBAL_COMPONENT_MEMORY_MAP.set(componentIdx, inner);
    }
    
    inner[memoryIdx] = { memory, memoryIdx, componentIdx };
  }
  
  class RepTable {
    #data = [0, null];
    #size = 0;
    #target;
    
    constructor(args) {
      this.target = args?.target;
    }
    
    data() { return this.#data; }
    
    insert(val) {
      _debugLog('[RepTable#insert()] args', { val, target: this.target });
      const freeIdx = this.#data[0];
      if (freeIdx === 0) {
        this.#data.push(val);
        this.#data.push(null);
        const rep = (this.#data.length >> 1) - 1;
        _debugLog('[RepTable#insert()] inserted', { val, target: this.target, rep });
        this.#size += 1;
        return rep;
      }
      this.#data[0] = this.#data[freeIdx << 1];
      const placementIdx = freeIdx << 1;
      this.#data[placementIdx] = val;
      this.#data[placementIdx + 1] = null;
      _debugLog('[RepTable#insert()] inserted', { val, target: this.target, rep: freeIdx });
      this.#size += 1;
      return freeIdx;
    }
    
    get(rep) {
      _debugLog('[RepTable#get()] args', { rep, target: this.target });
      if (rep === 0) { throw new Error('invalid resource rep during get, (cannot be 0)'); }
      
      const baseIdx = rep << 1;
      const val = this.#data[baseIdx];
      return val;
    }
    
    contains(rep) {
      _debugLog('[RepTable#contains()] args', { rep, target: this.target });
      if (rep === 0) { throw new Error('invalid resource rep during contains, (cannot be 0)'); }
      
      const baseIdx = rep << 1;
      return !!this.#data[baseIdx];
    }
    
    remove(rep) {
      _debugLog('[RepTable#remove()] args', { rep, target: this.target });
      if (rep === 0) { throw new Error('invalid resource rep during remove, (cannot be 0)'); }
      if (this.#data.length === 2) { throw new Error('invalid'); }
      
      const baseIdx = rep << 1;
      const val = this.#data[baseIdx];
      
      this.#data[baseIdx] = this.#data[0];
      this.#data[0] = rep;
      this.#size -= 1;
      
      return val;
    }
    
    size() { return this.#size; }
    
    clear() {
      _debugLog('[RepTable#clear()] args', { rep, target: this.target });
      this.#data = [0, null];
    }
  }
  const _coinFlip = () => { return Math.random() > 0.5; };
  let SCOPE_ID = 0;
  const I32_MIN = -2_147_483_648;
  
  const I32_MAX= 2_147_483_647;
  
  
  function _isValidNumericPrimitive(ty, v) {
    if (v === undefined || v === null) { return false; }
    switch (ty) {
      case 'bool':
      return v === 0 || v === 1;
      break;
      case 'u8':
      return v >= 0 && v <= 255;
      break;
      case 's8':
      return v >= -128 && v <= 127;
      break;
      case 'u16':
      return v >= 0 && v <= 65535;
      break;
      case 's16':
      return v >= -32768 && v <= 32767;
      case 'u32':
      return v >= 0 && v <= 4_294_967_295;
      case 's32':
      return v >= -2_147_483_648 && v <= 2_147_483_647;
      case 'u64':
      return typeof v === 'bigint' && v >= 0 && v <= 18_446_744_073_709_551_615n;
      case 's64':
      return typeof v === 'bigint' && v >= -9223372036854775808n && v <= 9223372036854775807n;
      break;
      case 'f32':
      case 'f64': return typeof v === 'number';
      default:
      return false;
    }
    return true;
  }
  
  function _requireValidNumericPrimitive(ty, v) {
    if (v === undefined  || v === null || !_isValidNumericPrimitive(ty, v)) {
      throw new TypeError(`invalid ${ty} value [${v}]`);
    }
    return true;
  }
  
  const _typeCheckValidI32 = (n) => typeof n === 'number' && n >= I32_MIN && n <= I32_MAX;
  
  
  const _typeCheckAsyncFn= (f) => {
    return f instanceof ASYNC_FN_CTOR;
  };
  
  let RESOURCE_CALL_BORROWS = [];const ASYNC_FN_CTOR = (async () => {}).constructor;
  
  function clearCurrentTask(componentIdx, taskID) {
    _debugLog('[clearCurrentTask()] args', { componentIdx, taskID });
    
    if (componentIdx === undefined || componentIdx === null) {
      throw new Error('missing/invalid component instance index while ending current task');
    }
    
    const tasks = ASYNC_TASKS_BY_COMPONENT_IDX.get(componentIdx);
    if (!tasks || !Array.isArray(tasks)) {
      throw new Error('missing/invalid tasks for component instance while ending task');
    }
    if (tasks.length == 0) {
      throw new Error(`no current tasks for component instance [${componentIdx}] while ending task`);
    }
    
    if (taskID !== undefined) {
      const last = tasks[tasks.length - 1];
      if (last.id !== taskID) {
        // throw new Error('current task does not match expected task ID');
        return;
      }
    }
    
    ASYNC_CURRENT_TASK_IDS.pop();
    ASYNC_CURRENT_COMPONENT_IDXS.pop();
    
    const taskMeta = tasks.pop();
    return taskMeta.task;
  }
  
  const CURRENT_TASK_MAY_BLOCK= globalThis.WebAssembly ? new globalThis.WebAssembly.Global({ value: 'i32', mutable: true }, 0) : false;
  
  const ASYNC_CURRENT_TASK_IDS = [];
  const ASYNC_CURRENT_COMPONENT_IDXS = [];
  
  function unpackCallbackResult(result) {
    if (!(_typeCheckValidI32(result))) { throw new Error('invalid callback return value [' + result + '], not a valid i32'); }
    const eventCode = result & 0xF;
    if (eventCode < 0 || eventCode > 3) {
      throw new Error('invalid async return value [' + eventCode + '], outside callback code range');
    }
    if (result < 0 || result >= 2**32) { throw new Error('invalid callback result'); }
    // TODO: table max length check?
    const waitableSetRep = result >> 4;
    return [eventCode, waitableSetRep];
  }
  
  class AsyncSubtask {
    static _ID = 0n;
    
    static State = {
      STARTING: 0,
      STARTED: 1,
      RETURNED: 2,
      CANCELLED_BEFORE_STARTED: 3,
      CANCELLED_BEFORE_RETURNED: 4,
    };
    
    #id;
    #state = AsyncSubtask.State.STARTING;
    #componentIdx;
    
    #parentTask;
    #childTask = null;
    
    #dropped = false;
    #cancelRequested = false;
    
    #memoryIdx = null;
    #lenders = null;
    
    #waitable = null;
    
    #callbackFn = null;
    #callbackFnName = null;
    
    #postReturnFn = null;
    #onProgressFn = null;
    #pendingEventFn = null;
    
    #callMetadata = {};
    
    #resolved = false;
    
    #onResolveHandlers = [];
    #onStartHandlers = [];
    
    #result = null;
    #resultSet = false;
    
    fnName;
    target;
    isAsync;
    isManualAsync;
    
    constructor(args) {
      if (typeof args.componentIdx !== 'number') {
        throw new Error('invalid componentIdx for subtask creation');
      }
      this.#componentIdx = args.componentIdx;
      
      this.#id = ++AsyncSubtask._ID;
      this.fnName = args.fnName;
      
      if (!args.parentTask) { throw new Error('missing parent task during subtask creation'); }
      this.#parentTask = args.parentTask;
      
      if (args.childTask) { this.#childTask = args.childTask; }
      
      if (args.memoryIdx) { this.#memoryIdx = args.memoryIdx; }
      
      if (!args.waitable) { throw new Error("missing/invalid waitable"); }
      this.#waitable = args.waitable;
      
      if (args.callMetadata) { this.#callMetadata = args.callMetadata; }
      
      this.#lenders = [];
      this.target = args.target;
      this.isAsync = args.isAsync;
      this.isManualAsync = args.isManualAsync;
    }
    
    id() { return this.#id; }
    parentTaskID() { return this.#parentTask?.id(); }
    childTaskID() { return this.#childTask?.id(); }
    state() { return this.#state; }
    
    waitable() { return this.#waitable; }
    waitableRep() { return this.#waitable.idx(); }
    
    join() { return this.#waitable.join(...arguments); }
    getPendingEvent() { return this.#waitable.getPendingEvent(...arguments); }
    hasPendingEvent() { return this.#waitable.hasPendingEvent(...arguments); }
    setPendingEvent() { return this.#waitable.setPendingEvent(...arguments); }
    
    setTarget(tgt) { this.target = tgt; }
    
    getResult() {
      if (!this.#resultSet) { throw new Error("subtask result has not been set") }
      return this.#result;
    }
    setResult(v) {
      if (this.#resultSet) { throw new Error("subtask result has already been set"); }
      this.#result = v;
      this.#resultSet = true;
    }
    
    componentIdx() { return this.#componentIdx; }
    
    setChildTask(t) {
      if (!t) { throw new Error('cannot set missing/invalid child task on subtask'); }
      if (this.#childTask) { throw new Error('child task is already set on subtask'); }
      if (this.#parentTask === t) { throw new Error("parent cannot be child"); }
      this.#childTask = t;
    }
    getChildTask(t) { return this.#childTask; }
    
    getParentTask() { return this.#parentTask; }
    
    setCallbackFn(f, name) {
      if (!f) { return; }
      if (this.#callbackFn) { throw new Error('callback fn can only be set once'); }
      this.#callbackFn = f;
      this.#callbackFnName = name;
    }
    
    getCallbackFnName() {
      if (!this.#callbackFn) { return undefined; }
      return this.#callbackFn.name;
    }
    
    setPostReturnFn(f) {
      if (!f) { return; }
      if (this.#postReturnFn) { throw new Error('postReturn fn can only be set once'); }
      this.#postReturnFn = f;
    }
    
    setOnProgressFn(f) {
      if (this.#onProgressFn) { throw new Error('on progress fn can only be set once'); }
      this.#onProgressFn = f;
    }
    
    isNotStarted() {
      return this.#state == AsyncSubtask.State.STARTING;
    }
    
    registerOnStartHandler(f) {
      this.#onStartHandlers.push(f);
    }
    
    onStart(args) {
      _debugLog('[AsyncSubtask#onStart()] args', {
        componentIdx: this.#componentIdx,
        subtaskID: this.#id,
        parentTaskID: this.parentTaskID(),
        fnName: this.fnName,
        args,
      });
      
      if (this.#onProgressFn) { this.#onProgressFn(); }
      
      this.#state = AsyncSubtask.State.STARTED;
      
      let result;
      
      // If we have been provided a helper start function as a result of
      // component fusion performed by wasmtime tooling, then we can call that helper and lifts/lowers will
      // be performed for us.
      //
      // See also documentation on `HostIntrinsic::PrepareCall`
      //
      if (this.#callMetadata.startFn) {
        result = this.#callMetadata.startFn.apply(null, args?.startFnParams ?? []);
      }
      
      return result;
    }
    
    
    registerOnResolveHandler(f) {
      this.#onResolveHandlers.push(f);
    }
    
    reject(subtaskErr) {
      this.#childTask?.reject(subtaskErr);
    }
    
    onResolve(subtaskValue) {
      _debugLog('[AsyncSubtask#onResolve()] args', {
        componentIdx: this.#componentIdx,
        subtaskID: this.#id,
        isAsync: this.isAsync,
        childTaskID: this.childTaskID(),
        parentTaskID: this.parentTaskID(),
        parentTaskFnName: this.#parentTask?.entryFnName(),
        fnName: this.fnName,
      });
      
      if (this.#resolved) {
        throw new Error('subtask has already been resolved');
      }
      
      if (this.#onProgressFn) { this.#onProgressFn(); }
      
      if (subtaskValue === null && this.#cancelRequested) {
        if (this.#state === AsyncSubtask.State.STARTING) {
          this.#state = AsyncSubtask.State.CANCELLED_BEFORE_STARTED;
        } else {
          if (this.#state !== AsyncSubtask.State.STARTED) {
            throw new Error('resolved subtask must have been started before cancellation');
          }
          this.#state = AsyncSubtask.State.CANCELLED_BEFORE_RETURNED;
        }
      } else {
        if (this.#state !== AsyncSubtask.State.STARTED) {
          throw new Error('resolved subtask must have been started before completion');
        }
        this.#state = AsyncSubtask.State.RETURNED;
      }
      
      this.setResult(subtaskValue);
      
      for (const f of this.#onResolveHandlers) {
        try {
          f(subtaskValue);
        } catch (err) {
          console.error("error during subtask resolve handler", err);
          throw err;
        }
      }
      
      const callMetadata = this.getCallMetadata();
      
      // TODO(fix): we should be able to easily have the caller's meomry
      // to lower into here, but it's not present in PrepareCall
      const memory = callMetadata.memory ?? this.#parentTask?.getReturnMemory() ?? lookupMemoriesForComponent({ componentIdx: this.#parentTask?.componentIdx() })[0];
      if (callMetadata && !callMetadata.returnFn && this.isAsync && callMetadata.resultPtr && memory) {
        const { resultPtr, realloc } = callMetadata;
        const lowers = callMetadata.lowers; // may have been updated in task.return of the child
        if (lowers && lowers.length > 0) {
          lowers[0]({
            componentIdx: this.#componentIdx,
            memory,
            realloc,
            vals: [subtaskValue],
            storagePtr: resultPtr,
            stringEncoding: callMetadata.stringEncoding,
          });
        }
      }
      
      this.#resolved = true;
      this.#parentTask.removeSubtask(this);
      
      if (!this.isAsync) {
        this.deliverResolve();
        const rep = this.waitableRep();
        if (rep) {
          try {
            const removed = this.#getComponentState().handles.remove(rep);
            if (removed !== this) {
              throw new Error("unexpectedly received non-self Subtask from handle removal");
            }
            this.drop();
          } catch (err) {
            _debugLog('[AsyncSubtask#onResolve()] failed to remove subtask after sync subtask completion', err);
          }
        }
      }
    }
    
    getStateNumber() { return this.#state; }
    isReturned() { return this.#state === AsyncSubtask.State.RETURNED; }
    
    getCallMetadata() { return this.#callMetadata; }
    
    isResolved() {
      if (this.#state === AsyncSubtask.State.STARTING
      || this.#state === AsyncSubtask.State.STARTED) {
        return false;
      }
      if (this.#state === AsyncSubtask.State.RETURNED
      || this.#state === AsyncSubtask.State.CANCELLED_BEFORE_STARTED
      || this.#state === AsyncSubtask.State.CANCELLED_BEFORE_RETURNED) {
        return true;
      }
      throw new Error('unrecognized internal Subtask state [' + this.#state + ']');
    }
    
    addLender(handle) {
      _debugLog('[AsyncSubtask#addLender()] args', { handle });
      if (!Number.isNumber(handle)) { throw new Error('missing/invalid lender handle [' + handle + ']'); }
      
      if (this.#lenders.length === 0 || this.isResolved()) {
        throw new Error('subtask has no lendors or has already been resolved');
      }
      
      handle.lends++;
      this.#lenders.push(handle);
    }
    
    deliverResolve() {
      _debugLog('[AsyncSubtask#deliverResolve()] args', {
        lenders: this.#lenders,
        parentTaskID: this.parentTaskID(),
        subtaskID: this.#id,
        childTaskID: this.childTaskID(),
        resolved: this.isResolved(),
        resolveDelivered: this.resolveDelivered(),
      });
      
      const cannotDeliverResolve = this.resolveDelivered() || !this.isResolved();
      if (cannotDeliverResolve) {
        throw new Error('subtask cannot deliver resolution twice, and the subtask must be resolved');
      }
      
      for (const lender of this.#lenders) {
        lender.lends--;
      }
      
      this.#lenders = null;
    }
    
    resolveDelivered() {
      _debugLog('[AsyncSubtask#resolveDelivered()] args', { });
      if (this.#lenders === null && !this.isResolved()) {
        throw new Error('invalid subtask state, lenders missing and subtask has not been resolved');
      }
      return this.#lenders === null;
    }
    
    drop() {
      _debugLog('[AsyncSubtask#drop()] args', {
        componentIdx: this.#componentIdx,
        parentTaskID: this.#parentTask?.id(),
        parentTaskFnName: this.#parentTask?.entryFnName(),
        childTaskID: this.#childTask?.id(),
        childTaskFnName: this.#childTask?.entryFnName(),
        subtaskFnName: this.fnName,
      });
      if (!this.#waitable) { throw new Error('missing/invalid inner waitable'); }
      if (!this.resolveDelivered()) {
        throw new Error('cannot drop subtask before resolve is delivered');
      }
      if (this.#waitable) { this.#waitable.drop() }
      this.#dropped = true;
    }
    
    #getComponentState() {
      const state = getOrCreateAsyncState(this.#componentIdx);
      if (!state) {
        throw new Error('invalid/missing async state for component [' + componentIdx + ']');
      }
      return state;
    }
    
    getWaitableHandleIdx() {
      _debugLog('[AsyncSubtask#getWaitableHandleIdx()] args', { });
      if (!this.#waitable) { throw new Error('missing/invalid waitable'); }
      return this.waitableRep();
    }
  }
  
  function _prepareCall(
  memoryIdx,
  getMemoryFn,
  startFn,
  returnFn,
  callerComponentIdx,
  calleeComponentIdx,
  taskReturnTypeIdx,
  calleeIsAsyncInt,
  stringEncoding,
  resultCountOrAsync,
  ) {
    _debugLog('[_prepareCall()]', {
      memoryIdx,
      callerComponentIdx,
      calleeComponentIdx,
      taskReturnTypeIdx,
      calleeIsAsyncInt,
      stringEncoding,
      resultCountOrAsync,
    });
    const argArray = [...arguments];
    
    // value passed in *may* be as large as u32::MAX which may be mangled into -2
    resultCountOrAsync >>>= 0;
    
    let isAsync = false;
    let hasResultPointer = false;
    if (resultCountOrAsync === 2**32 - 1) {
      // prepare async with no result (u32::MAX)
      isAsync = true;
      hasResultPointer = false;
    } else if (resultCountOrAsync === 2**32 - 2) {
      // prepare async with result (u32::MAX - 1)
      isAsync = true;
      hasResultPointer = true;
    }
    
    const currentCallerTaskMeta = getCurrentTask(callerComponentIdx);
    if (!currentCallerTaskMeta) {
      throw new Error('invalid/missing current task for caller during prepare call');
    }
    
    const currentCallerTask = currentCallerTaskMeta.task;
    if (!currentCallerTask) {
      throw new Error('unexpectedly missing task in meta for caller during prepare call');
    }
    
    if (currentCallerTask.componentIdx() !== callerComponentIdx) {
      throw new Error(`task component idx [${ currentCallerTask.componentIdx() }] !== [${ callerComponentIdx }] (callee ${ calleeComponentIdx })`);
    }
    
    let getCalleeParamsFn;
    let resultPtr = null;
    let directParamsArr;
    if (hasResultPointer) {
      directParamsArr = argArray.slice(10, argArray.length - 1);
      getCalleeParamsFn = () => directParamsArr;
      resultPtr = argArray[argArray.length - 1];
    } else {
      directParamsArr = argArray.slice(10);
      getCalleeParamsFn = () => directParamsArr;
    }
    
    let encoding;
    switch (stringEncoding) {
      case 0:
      encoding = 'utf8';
      break;
      case 1:
      encoding = 'utf16';
      break;
      case 2:
      encoding = 'compact-utf16';
      break;
      default:
      throw new Error(`unrecognized string encoding enum [${stringEncoding}]`);
    }
    
    const subtask = currentCallerTask.createSubtask({
      componentIdx: callerComponentIdx,
      parentTask: currentCallerTask,
      isAsync,
      callMetadata: {
        getMemoryFn,
        memoryIdx,
        resultPtr,
        returnFn,
        startFn,
        stringEncoding,
      }
    });
    
    const [newTask, newTaskID] = createNewCurrentTask({
      componentIdx: calleeComponentIdx,
      isAsync,
      getCalleeParamsFn,
      entryFnName: [
      'task',
      subtask.getParentTask().id(),
      'subtask',
      subtask.id(),
      'new-prepared-async-task'
      ].join('/'),
      stringEncoding,
    });
    newTask.setParentSubtask(subtask);
    newTask.setReturnMemoryIdx(memoryIdx);
    newTask.setReturnMemory(getMemoryFn);
    subtask.setChildTask(newTask);
    
    newTask.subtaskMeta = {
      subtask,
      calleeComponentIdx,
      callerComponentIdx,
      getCalleeParamsFn,
      stringEncoding,
      isAsync,
    };
    
    _setGlobalCurrentTaskMeta({
      taskID: newTask.id(),
      componentIdx: newTask.componentIdx(),
    });
  }
  
  function _asyncStartCall(args, callee, paramCount, resultCount, flags) {
    const componentIdx = ASYNC_CURRENT_COMPONENT_IDXS.at(-1);
    
    const globalTaskMeta = _getGlobalCurrentTaskMeta(componentIdx);
    if (!globalTaskMeta) { throw new Error('missing global current task globalTaskMeta'); }
    const taskID = globalTaskMeta.taskID;
    
    _debugLog('[_asyncStartCall()] args', { args, componentIdx });
    const { getCallbackFn, callbackIdx, getPostReturnFn, postReturnIdx } = args;
    
    const preparedTaskMeta = getCurrentTask(componentIdx, taskID);
    if (!preparedTaskMeta) { throw new Error('unexpectedly missing current task'); }
    
    const preparedTask = preparedTaskMeta.task;
    if (!preparedTask) { throw new Error('unexpectedly missing current task'); }
    if (!preparedTask.subtaskMeta) { throw new Error('missing subtask meta from prepare'); }
    
    const {
      subtask,
      returnMemoryIdx,
      getReturnMemoryFn,
      callerComponentIdx,
      calleeComponentIdx,
      getCalleeParamsFn,
      isAsync,
      stringEncoding,
    } = preparedTask.subtaskMeta;
    if (!subtask) { throw new Error("missing subtask from cstate during async start call"); }
    if (calleeComponentIdx !== preparedTask.componentIdx()) {
      throw new Error(`meta callee idx [${calleeComponentIdx}] != current task idx [${preparedTask.componentIdx()}] during async start call`);
    }
    if (calleeComponentIdx !== componentIdx) {
      throw new Error("mismatched componentIdx for async start call (does not match prepare)");
    }
    
    const argArray = [...arguments];
    
    if (resultCount < 0 || resultCount > 1) { throw new Error('invalid/unsupported result count'); }
    
    const callbackFnName = 'callback_' + callbackIdx;
    const callbackFn = getCallbackFn();
    preparedTask.setCallbackFn(callbackFn, callbackFnName);
    preparedTask.setPostReturnFn(getPostReturnFn());
    
    if (resultCount < 0 || resultCount > 1) {
      throw new Error(`unsupported result count [${ resultCount }]`);
    }
    
    const params = preparedTask.getCalleeParams();
    if (paramCount !== params.length) {
      throw new Error(`unexpected callee param count [${ params.length }], _asyncStartCall invocation expected [${ paramCount }]`);
    }
    
    const callerComponentState = getOrCreateAsyncState(subtask.componentIdx());
    
    const calleeComponentState = getOrCreateAsyncState(preparedTask.componentIdx());
    const calleeBackpressure = calleeComponentState.hasBackpressure();
    
    // Set up a handler on subtask completion to lower results from the call into the caller's memory region.
    //
    // NOTE: during fused guest->guest calls this handler is triggered, but does not actually perform
    // lowering manually, as fused modules provider helper functions that can
    subtask.registerOnResolveHandler((res) => {
      _debugLog('[_asyncStartCall()] handling subtask result', { res, subtaskID: subtask.id() });
      
      let subtaskCallMeta = subtask.getCallMetadata();
      
      // NOTE: in the case of guest -> guest async calls, there may be no memory/realloc present,
      // as the host will intermediate the value storage/movement between calls.
      //
      // We can simply take the value and lower it as a parameter
      if (subtaskCallMeta.memory || subtaskCallMeta.realloc) {
        throw new Error("call metadata unexpectedly contains memory/realloc for guest->guest call");
      }
      
      const callerTask = subtask.getParentTask();
      const calleeTask = preparedTask;
      const callerMemoryIdx = callerTask.getReturnMemoryIdx();
      const callerComponentIdx = callerTask.componentIdx();
      
      // If a helper function was provided we are likely in a fused guest->guest call,
      // and the result will be delivered (lift/lowered) via helper function
      if (subtaskCallMeta && subtaskCallMeta.returnFn) {
        _debugLog('[_asyncStartCall()] return function present while handling subtask result, returning early (skipping lower)', {
          calleeTaskID: calleeTask.id(),
          calleeComponentIdx,
        });
        
        // TODO: centralize calling of returnFn to *one place* (if possible)
        if (subtaskCallMeta.returnFnCalled) { return; }
        
        const res = subtaskCallMeta.returnFn.apply(null, [subtaskCallMeta.resultPtr]);
        
        _debugLog('[_asyncStartCall()] finished calling return fn', {
          calleeTaskID: calleeTask.id(),
          calleeComponentIdx,
          res,
        });
        
        return;
      }
      
      // If there is no where to lower the results, exit early
      if (!subtaskCallMeta.resultPtr) {
        _debugLog('[_asyncStartCall()] no result ptr during subtask result handling, returning early (skipping lower)');
        return;
      }
      
      let callerMemory;
      if (callerMemoryIdx !== null && callerMemoryIdx !== undefined) {
        callerMemory = lookupMemoriesForComponent({ componentIdx: callerComponentIdx, memoryIdx: callerMemoryIdx });
      } else {
        const callerMemories = lookupMemoriesForComponent({ componentIdx: callerComponentIdx });
        if (callerMemories.length !== 1) { throw new Error(`unsupported amount of caller memories`); }
        callerMemory = callerMemories[0];
      }
      
      if (!callerMemory) {
        _debugLog('[_asyncStartCall()] missing memory', { subtaskID: subtask.id(), res });
        throw new Error(`missing memory for to guest->guest call result (subtask [${subtask.id()}])`);
      }
      
      const lowerFns = calleeTask.getReturnLowerFns();
      if (!lowerFns || lowerFns.length === 0) {
        _debugLog('[_asyncStartCall()] missing result lower metadata for guest->guest call', { subtaskID: subtask.id() });
        throw new Error(`missing result lower metadata for guest->guest call (subtask [${subtask.id()}])`);
      }
      
      if (lowerFns.length !== 1) {
        _debugLog('[_asyncStartCall()] only single result reportetd for guest->guest call', { subtaskID: subtask.id() });
        throw new Error(`only single result supported for guest->guest calls (subtask [${subtask.id()}])`);
      }
      
      _debugLog('[_asyncStartCall()] lowering results', { subtaskID: subtask.id() });
      lowerFns[0]({
        realloc: undefined,
        memory: callerMemory,
        vals: [res],
        storagePtr: subtaskCallMeta.resultPtr,
        componentIdx: callerComponentIdx,
        stringEncoding: subtaskCallMeta.stringEncoding,
      });
      
    });
    
    subtask.setOnProgressFn(() => {
      subtask.setPendingEvent(() => {
        if (subtask.isResolved()) { subtask.deliverResolve(); }
        const event = {
          code: ASYNC_EVENT_CODE.SUBTASK,
          payload0: subtask.waitableRep(),
          payload1: subtask.getStateNumber(),
        };
        return event;
      });
    });
    
    // Start the (event) driver loop that will resolve the subtask
    // in a new JS task
    setTimeout(async () => {
      _debugLog('[_asyncStartCall()] continuing started subtask (in JS task)', {
        taskID: preparedTask.id(),
        subtaskID: subtask.id(),
        callerComponentIdx,
        calleeComponentIdx,
      });
      
      let startRes = subtask.onStart({ startFnParams: params });
      startRes = Array.isArray(startRes) ? startRes : [startRes];
      
      if (calleeComponentState.isExclusivelyLocked()) {
        _debugLog('[_asyncStartCall()] during continuation callee is exclusively locked, suspending...', {
          taskID: preparedTask.id(),
          subtaskID: subtask.id(),
          callerComponentIdx,
          calleeComponentIdx,
        });
        await calleeComponentState.suspendTask({
          task: preparedTask,
          readyFn: () => !calleeComponentState.isExclusivelyLocked(),
        });
      }
      
      const started = await preparedTask.enter();
      if (!started) {
        _debugLog('[_asyncStartCall()] task failed early', {
          taskID: preparedTask.id(),
          subtaskID: subtask.id(),
        });
        throw new Error("task failed to start");
        return;
      }
      
      let callbackResult;
      try {
        let jspiCallee;
        if (callee._cachedPromising) {
          jspiCallee = callee._cachedPromising;
        } else {
          callee._cachedPromising = WebAssembly.promising(callee);
          jspiCallee = callee._cachedPromising;
        }
        
        callbackResult = await _withGlobalCurrentTaskMetaAsync({
          taskID: preparedTask.id(),
          componentIdx: preparedTask.componentIdx(),
          fn: () => {
            return jspiCallee.apply(null, startRes);
          }
        });
      } catch(err) {
        _debugLog("[_asyncStartCall()] initial subtask callee run failed", err);
        // NOTE: a good place to rejectt the parent task, if rejection API is enabled
        // subtask.reject(err);
        // subtask.getParentTask().reject(err);
        
        subtask.getParentTask().setErrored(err);
        
        return;
      }
      
      // If there was no callback function, we're dealing with a sync function
      // that was lifted as async without one, there is only the callee.
      if (!callbackFn) {
        _debugLog("[_asyncStartCall()] no callback, resolving w/ callee result", {
          taskID: preparedTask.id(),
          componentIdx: preparedTask.componentIdx(),
          preparedTask,
          stateNumber: preparedTask.taskState(),
          isResolved: preparedTask.isResolved(),
          callbackFn,
        });
        preparedTask.resolve([callbackResult]);
        return;
      }
      
      let fnName = callbackFn.fnName;
      if (!fnName) {
        fnName = [
        '<task ',
        subtask.parentTaskID(),
        '/subtask ',
        subtask.id(),
        '/task ',
        preparedTask.id(),
        '>',
        ].join("");
      }
      
      try {
        _debugLog("[_asyncStartCall()] starting driver loop", {
          fnName,
          componentIdx: preparedTask.componentIdx(),
          subtaskID: subtask.id(),
          childTaskID: subtask.childTaskID(),
          parentTaskID: subtask.parentTaskID(),
        });
        
        await _driverLoop({
          componentState: calleeComponentState,
          task: preparedTask,
          fnName,
          isAsync: true,
          callbackResult,
          resolve,
          reject
        });
      } catch (err) {
        _debugLog("[AsyncStartCall] drive loop call failure", { err });
      }
      
    }, 0);
    
    const subtaskState = subtask.getStateNumber();
    if (subtaskState < 0 || subtaskState > 2**5) {
      throw new Error('invalid subtask state, out of valid range');
    }
    
    _debugLog('[_asyncStartCall()] returning subtask rep & state', {
      subtask: {
        rep: subtask.waitableRep(),
        state: subtaskState,
      }
    });
    
    return Number(subtask.waitableRep()) << 4 | subtaskState;
  }
  
  function _syncStartCall(callbackIdx) {
    _debugLog('[_syncStartCall()] args', { callbackIdx });
    throw new Error('synchronous start call not implemented!');
  }
  
  class Waitable {
    #componentIdx;
    
    #pendingEventFn = null;
    
    #promise;
    #resolve;
    #reject;
    
    #waitableSet = null;
    
    #hasSyncWaiter = false;
    
    #idx = null; // to component-global waitables
    
    target;
    
    constructor(args) {
      const { componentIdx, target } = args;
      this.#componentIdx = componentIdx;
      this.target = args.target;
      this.#resetPromise();
    }
    
    componentIdx() { return this.#componentIdx; }
    isInSet() { return this.#waitableSet !== null; }
    
    idx() { return this.#idx; }
    setIdx(idx) {
      if (idx === 0) { throw new Error("waitable idx cannot be zero"); }
      this.#idx = idx;
    }
    
    setTarget(tgt) { this.target = tgt; }
    
    #resetPromise() {
      const { promise, resolve, reject } = promiseWithResolvers()
      this.#promise = promise;
      this.#resolve = resolve;
      this.#reject = reject;
    }
    
    resolve() { this.#resolve(); }
    reject(err) { this.#reject(err); }
    promise() { return this.#promise; }
    
    hasPendingEvent() {
      // _debugLog('[Waitable#hasPendingEvent()]', {
        //     componentIdx: this.#componentIdx,
        //     waitable: this,
        //     waitableSet: this.#waitableSet,
        //     hasPendingEvent: this.#pendingEventFn !== null,
        // });
        return this.#pendingEventFn !== null;
      }
      
      setPendingEvent(fn) {
        _debugLog('[Waitable#setPendingEvent()] args', {
          waitable: this,
          inSet: this.#waitableSet,
        });
        this.#pendingEventFn = fn;
      }
      
      getPendingEvent() {
        _debugLog('[Waitable#getPendingEvent()] args', {
          waitable: this,
          inSet: this.#waitableSet,
          hasPendingEvent: this.#pendingEventFn !== null,
        });
        if (this.#pendingEventFn === null) { return null; }
        const eventFn = this.#pendingEventFn;
        this.#pendingEventFn = null;
        const e = eventFn();
        this.#resetPromise();
        return e;
      }
      
      join(waitableSet) {
        _debugLog('[Waitable#join()] args', {
          waitable: this,
          waitableSet: waitableSet,
          isRemoval: waitableSet === null,
        });
        
        if (this.#waitableSet === undefined) {
          throw new TypeError('waitable set must be not be undefined');
        }
        
        if (this.#waitableSet) {
          this.#waitableSet.removeWaitable(this);
        }
        
        this.#waitableSet = waitableSet;
        
        if (waitableSet) {
          this.#waitableSet.addWaitable(this);
        }
      }
      
      drop() {
        _debugLog('[Waitable#drop()] args', {
          componentIdx: this.#componentIdx,
          waitable: this,
        });
        if (this.hasPendingEvent()) {
          throw new Error('waitables with pending events cannot be dropped');
        }
        this.join(null);
      }
      
      async waitForPendingEvent(args) {
        const { cstate } = args;
        if (!cstate) { throw new TypeError('missing component state'); }
        
        if (this.#waitableSet !== null || this.#hasSyncWaiter) {
          throw new Error("waitable is already in a set/has a sync waiter");
        }
        this.#hasSyncWaiter = true;
        await cstate.waitUntil({
          cancellable: false,
          readyFn: () => this.hasPendingEvent(),
        });
        this.#hasSyncWaiter = false;
      }
      
    }
    
    const ERR_CTX_TABLES = {};
    
    function contextGet(ctx) {
      const { componentIdx, slot } = ctx;
      if (componentIdx === undefined) { throw new TypeError("missing component idx"); }
      if (slot === undefined) { throw new TypeError("missing slot"); }
      
      const currentTaskMeta = _getGlobalCurrentTaskMeta(componentIdx);
      if (!currentTaskMeta) {
        throw new Error(`missing/incomplete global current task meta for component idx [${componentIdx}] during context set`);
      }
      const taskID = currentTaskMeta.taskID;
      
      const taskMeta = getCurrentTask(componentIdx, taskID);
      if (!taskMeta) { throw new Error('failed to retrieve current task'); }
      
      let task = taskMeta.task;
      if (!task) { throw new Error('invalid/missing current task in metadata while getting context'); }
      
      _debugLog('[contextGet()] args', {
        slot,
        storage: task.storage,
        taskID: task.id(),
        componentIdx: task.componentIdx(),
      });
      
      if (slot < 0 || slot >= task.storage.length) { throw new Error('invalid slot for current task'); }
      
      return task.storage[slot];
    }
    
    
    function contextSet(ctx, value) {
      const { componentIdx, slot } = ctx;
      if (componentIdx === undefined) { throw new TypeError("missing component idx"); }
      if (slot === undefined) { throw new TypeError("missing slot"); }
      if (!(_typeCheckValidI32(value))) { throw new Error('invalid value for context set (not valid i32)'); }
      
      const currentTaskMeta = _getGlobalCurrentTaskMeta(componentIdx);
      if (!currentTaskMeta) {
        throw new Error(`missing/incomplete global current task meta for component idx [${componentIdx}] during context set`);
      }
      const taskID = currentTaskMeta.taskID;
      
      const taskMeta = getCurrentTask(componentIdx, taskID);
      if (!taskMeta) { throw new Error('failed to retrieve current task'); }
      
      let task = taskMeta.task;
      if (!task) { throw new Error('invalid/missing current task in metadata while setting context'); }
      
      _debugLog('[contextSet()] args', {
        slot,
        value,
        storage: task.storage,
        taskID: task.id(),
        componentIdx: task.componentIdx(),
      });
      
      if (slot < 0 || slot >= task.storage.length) { throw new Error('invalid slot for current task'); }
      task.storage[slot] = value;
    }
    
    const ASYNC_TASKS_BY_COMPONENT_IDX = new Map();
    
    class AsyncTask {
      static _ID = 0n;
      
      static State = {
        INITIAL: 'initial',
        CANCELLED: 'cancelled',
        CANCEL_PENDING: 'cancel-pending',
        CANCEL_DELIVERED: 'cancel-delivered',
        RESOLVED: 'resolved',
      }
      
      static BlockResult = {
        CANCELLED: 'block.cancelled',
        NOT_CANCELLED: 'block.not-cancelled',
      }
      
      #id;
      #componentIdx;
      #state;
      #isAsync;
      #isManualAsync;
      #entryFnName = null;
      
      #onResolveHandlers = [];
      #completionPromise = null;
      #rejected = false;
      
      #exitPromise = null;
      #onExitHandlers = [];
      
      #memoryIdx = null;
      #memory = null;
      
      #callbackFn = null;
      #callbackFnName = null;
      
      #postReturnFn = null;
      
      #getCalleeParamsFn = null;
      
      #stringEncoding = null;
      
      #parentSubtask = null;
      
      #errHandling;
      
      #backpressurePromise;
      #backpressureWaiters = 0n;
      
      #returnLowerFns = null;
      
      #subtasks = [];
      
      #entered = false;
      #exited = false;
      #errored = null;
      
      cancelled = false;
      cancelRequested = false;
      alwaysTaskReturn = false;
      
      returnCalls =  0;
      storage = [0, 0];
      borrowedHandles = {};
      
      tmpRetI64HighBits = 0|0;
      
      constructor(opts) {
        this.#id = ++AsyncTask._ID;
        
        if (opts?.componentIdx === undefined) {
          throw new TypeError('missing component id during task creation');
        }
        this.#componentIdx = opts.componentIdx;
        
        this.#state = AsyncTask.State.INITIAL;
        this.#isAsync = opts?.isAsync ?? false;
        this.#isManualAsync = opts?.isManualAsync ?? false;
        this.#entryFnName = opts.entryFnName;
        
        const {
          promise: completionPromise,
          resolve: resolveCompletionPromise,
          reject: rejectCompletionPromise,
        } = promiseWithResolvers();
        this.#completionPromise = completionPromise;
        
        this.#onResolveHandlers.push((results) => {
          if (this.#parentSubtask !== null) { return; }
          if (!this.#isAsync) { return; }
          
          if (this.#errored !== null) {
            rejectCompletionPromise(this.#errored);
            return;
          } else if (this.#rejected) {
            rejectCompletionPromise(results);
            return;
          }
          
          resolveCompletionPromise(results);
        });
        
        const {
          promise: exitPromise,
          resolve: resolveExitPromise,
          reject: rejectExitPromise,
        } = promiseWithResolvers();
        this.#exitPromise = exitPromise;
        
        this.#onExitHandlers.push(() => {
          resolveExitPromise();
        });
        
        if (opts.callbackFn) { this.#callbackFn = opts.callbackFn; }
        if (opts.callbackFnName) { this.#callbackFnName = opts.callbackFnName; }
        
        if (opts.getCalleeParamsFn) { this.#getCalleeParamsFn = opts.getCalleeParamsFn; }
        
        if (opts.stringEncoding) { this.#stringEncoding = opts.stringEncoding; }
        
        if (opts.parentSubtask) { this.#parentSubtask = opts.parentSubtask; }
        
        
        if (opts.errHandling) { this.#errHandling = opts.errHandling; }
      }
      
      taskState() { return this.#state; }
      id() { return this.#id; }
      componentIdx() { return this.#componentIdx; }
      entryFnName() { return this.#entryFnName; }
      
      completionPromise() { return this.#completionPromise; }
      exitPromise() { return this.#exitPromise; }
      
      isAsync() { return this.#isAsync; }
      isSync() { return !this.isAsync(); }
      
      getErrHandling() { return this.#errHandling; }
      
      hasCallback() { return this.#callbackFn !== null; }
      
      getReturnMemoryIdx() { return this.#memoryIdx; }
      setReturnMemoryIdx(idx) {
        if (idx === null) { return; }
        this.#memoryIdx = idx;
      }
      
      getReturnMemory() { return this.#memory; }
      setReturnMemory(m) {
        if (m === null) { return; }
        this.#memory = m;
      }
      
      setReturnLowerFns(fns) { this.#returnLowerFns = fns; }
      getReturnLowerFns() { return this.#returnLowerFns; }
      
      setParentSubtask(subtask) {
        if (!subtask || !(subtask instanceof AsyncSubtask)) { return }
        if (this.#parentSubtask) { throw new Error('parent subtask can only be set once'); }
        this.#parentSubtask = subtask;
      }
      
      getParentSubtask() { return this.#parentSubtask; }
      
      // TODO(threads): this is very inefficient, we can pass along a root task,
      // and ideally do not need this once thread support is in place
      getRootTask() {
        let currentSubtask = this.getParentSubtask();
        let task = this;
        while (currentSubtask) {
          task = currentSubtask.getParentTask();
          currentSubtask = task.getParentSubtask();
        }
        return task;
      }
      
      setPostReturnFn(f) {
        if (!f) { return; }
        if (this.#postReturnFn) { throw new Error('postReturn fn can only be set once'); }
        this.#postReturnFn = f;
      }
      
      setCallbackFn(f, name) {
        if (!f) { return; }
        if (this.#callbackFn) { throw new Error('callback fn can only be set once'); }
        this.#callbackFn = f;
        this.#callbackFnName = name;
      }
      
      getCallbackFnName() {
        if (!this.#callbackFnName) { return undefined; }
        return this.#callbackFnName;
      }
      
      async runCallbackFn(...args) {
        if (!this.#callbackFn) { throw new Error('no callback function has been set for task'); }
        return _withGlobalCurrentTaskMetaAsync({
          taskID: this.#id,
          componentIdx: this.#componentIdx,
          fn: () => { return this.#callbackFn.apply(null, args); }
        });
      }
      
      getCalleeParams() {
        if (!this.#getCalleeParamsFn) { throw new Error('missing/invalid getCalleeParamsFn'); }
        return this.#getCalleeParamsFn();
      }
      
      mayBlock() { return this.isAsync() || this.isResolvedState() }
      
      mayEnter(task) {
        const cstate = getOrCreateAsyncState(this.#componentIdx);
        if (cstate.hasBackpressure()) {
          _debugLog('[AsyncTask#mayEnter()] disallowed due to backpressure', { taskID: this.#id });
          return false;
        }
        if (!cstate.callingSyncImport()) {
          _debugLog('[AsyncTask#mayEnter()] disallowed due to sync import call', { taskID: this.#id });
          return false;
        }
        const callingSyncExportWithSyncPending = cstate.callingSyncExport && !task.isAsync;
        if (!callingSyncExportWithSyncPending) {
          _debugLog('[AsyncTask#mayEnter()] disallowed due to sync export w/ sync pending', { taskID: this.#id });
          return false;
        }
        return true;
      }
      
      enterSync() {
        if (this.needsExclusiveLock()) {
          const cstate = getOrCreateAsyncState(this.#componentIdx);
          // TODO(???): it is *very possible* for a the line below to fail if
          // an async function is already running (and holding the exclusive lock)
          //
          // It's not really possible to fix this unless we turn every sync export into
          // an async export that will use the regular async enabled `enter()`.
          cstate.exclusiveLock();
        }
        return true;
      }
      
      async enter(opts) {
        _debugLog('[AsyncTask#enter()] args', {
          taskID: this.#id,
          componentIdx: this.#componentIdx,
          subtaskID: this.getParentSubtask()?.id(),
          args: opts,
          entryFnName: this.#entryFnName,
        });
        
        if (this.#entered) {
          throw new Error(`task with ID [${this.#id}] should not be entered twice`);
        }
        
        const cstate = getOrCreateAsyncState(this.#componentIdx);
        
        if (opts?.isHost) {
          this.#entered = true;
          return this.#entered;
        }
        
        await cstate.nextTaskExecutionSlot({ task: this });
        
        // If a task is synchronous then we can avoid component-relevant
        // tracking and immediately enter.
        if (this.isSync()) {
          this.#entered = true;
          
          // TODO(breaking): remove once manually-specifying async fns is removed
          // It is currently possible for an actually sync export to be specified
          // as async via JSPI
          if (this.#isManualAsync) {
            if (this.needsExclusiveLock()) { cstate.exclusiveLock(); }
          }
          
          return this.#entered;
        }
        
        // Perform intial backpressure check
        if (cstate.hasBackpressure() || this.needsExclusiveLock() && cstate.isExclusivelyLocked()) {
          cstate.addBackpressureWaiter();
          
          const result = await this.waitUntil({
            readyFn: () => {
              return !(cstate.hasBackpressure()
              || this.needsExclusiveLock() && cstate.isExclusivelyLocked());
            },
            cancellable: true,
          });
          
          cstate.removeBackpressureWaiter();
          
          if (result === AsyncTask.BlockResult.CANCELLED) {
            this.cancel();
            return false;
          }
        }
        
        // Lock the component state or keep trying until we can/do
        try {
          if (this.needsExclusiveLock()) { cstate.exclusiveLock(); }
        } catch {
          // Continuously attempt to lock until we can
          while (cstate.hasBackpressure() || this.needsExclusiveLock() && cstate.isExclusivelyLocked()) {
            try {
              if (this.needsExclusiveLock()) { cstate.exclusiveLock(); }
              break;
            } catch(err) {
              cstate.addBackpressureWaiter();
              const result = await this.waitUntil({
                readyFn: () => {
                  return !(cstate.hasBackpressure()
                  || this.needsExclusiveLock() && cstate.isExclusivelyLocked());
                },
                cancellable: true,
              });
              cstate.removeBackpressureWaiter();
              if (result === AsyncTask.BlockResult.CANCELLED) {
                this.cancel();
                return false;
              }
            }
          }
        }
        
        this.#entered = true;
        return this.#entered;
      }
      
      isRunningState() { return this.#state !== AsyncTask.State.RESOLVED; }
      isResolvedState() { return this.#state === AsyncTask.State.RESOLVED; }
      isResolved() { return this.#state === AsyncTask.State.RESOLVED; }
      
      async waitUntil(opts) {
        const { readyFn, cancellable } = opts;
        _debugLog('[AsyncTask#waitUntil()] args', { taskID: this.#id, args: { cancellable } });
        
        // TODO(fix): check for cancel
        // TODO(fix): determinism
        // TODO(threads): add this thread to waiting list
        
        const keepGoing = await this.suspendUntil({
          readyFn,
          cancellable,
        });
        
        return keepGoing;
      }
      
      async yieldUntil(opts) {
        const { readyFn, cancellable } = opts;
        _debugLog('[AsyncTask#yieldUntil()]', {
          taskID: this.#id,
          args: {
            cancellable,
          },
          componentIdx: this.#componentIdx,
        });
        
        const keepGoing = await this.suspendUntil({ readyFn, cancellable });
        if (keepGoing) {
          return {
            code: ASYNC_EVENT_CODE.NONE,
            payload0: 0,
            payload1: 0,
          };
        }
        
        return {
          code: ASYNC_EVENT_CODE.TASK_CANCELLED,
          payload0: 0,
          payload1: 0,
        };
      }
      
      async suspendUntil(opts) {
        const { cancellable, readyFn } = opts;
        _debugLog('[AsyncTask#suspendUntil()] args', {
          taskID: this.#id,
          args: {
            cancellable,
          },
          componentIdx: this.#componentIdx,
        });
        
        const pendingCancelled = this.deliverPendingCancel({ cancellable });
        if (pendingCancelled) { return false; }
        
        const completed = await this.immediateSuspendUntil({ readyFn, cancellable });
        return completed;
      }
      
      // TODO(threads): equivalent to thread.suspend_until()
      async immediateSuspendUntil(opts) {
        const { cancellable, readyFn } = opts;
        _debugLog('[AsyncTask#immediateSuspendUntil()] args', {
          args: {
            cancellable,
            readyFn,
          },
          taskID: this.#id,
          componentIdx: this.#componentIdx,
        });
        
        const ready = readyFn();
        if (ready && ASYNC_DETERMINISM === 'random') {
          const coinFlip = _coinFlip();
          if (coinFlip) { return true }
        }
        
        const keepGoing = await this.immediateSuspend({ cancellable, readyFn });
        return keepGoing;
      }
      
      async immediateSuspend(opts) { // NOTE: equivalent to thread.suspend()
      // TODO(threads): store readyFn on the thread
      const { cancellable, readyFn } = opts;
      _debugLog('[AsyncTask#immediateSuspend()] args', { cancellable, readyFn });
      
      const pendingCancelled = this.deliverPendingCancel({ cancellable });
      if (pendingCancelled) { return false; }
      
      const cstate = getOrCreateAsyncState(this.#componentIdx);
      const keepGoing = await cstate.suspendTask({ task: this, readyFn });
      return keepGoing;
    }
    
    deliverPendingCancel(opts) {
      const { cancellable } = opts;
      _debugLog('[AsyncTask#deliverPendingCancel()]', {
        args: { cancellable },
        taskID: this.#id,
        componentIdx: this.#componentIdx,
      });
      
      if (cancellable && this.#state === AsyncTask.State.PENDING_CANCEL) {
        this.#state = AsyncTask.State.CANCEL_DELIVERED;
        return true;
      }
      
      return false;
    }
    
    isCancelled() { return this.cancelled }
    
    cancel(args) {
      _debugLog('[AsyncTask#cancel()] args', { });
      if (this.taskState() !== AsyncTask.State.CANCEL_DELIVERED) {
        throw new Error(`(component [${this.#componentIdx}]) task [${this.#id}] invalid task state [${this.taskState()}] for cancellation`);
      }
      if (this.borrowedHandles.length > 0) { throw new Error('task still has borrow handles'); }
      this.cancelled = true;
      this.onResolve(args?.error ?? new Error('task cancelled'));
      this.#state = AsyncTask.State.RESOLVED;
    }
    
    onResolve(taskValue) {
      const handlers = this.#onResolveHandlers;
      this.#onResolveHandlers = [];
      for (const f of handlers) {
        try {
          f(taskValue);
        } catch (err) {
          _debugLog("[AsyncTask#onResolve] error during task resolve handler", err);
          throw err;
        }
      }
      
      if (this.#parentSubtask) {
        const meta = this.#parentSubtask.getCallMetadata();
        // Run the rturn fn if it has not already been called -- this *should* have happened in
        // `task.return`, but some paths do not go through task.return (e.g. async lower of sync fn
        // which goes through prepare + async-start-call)
        if (meta.returnFn && !meta.returnFnCalled) {
          _debugLog('[AsyncTask#onResolve()] running returnFn', {
            componentIdx: this.#componentIdx,
            taskID: this.#id,
            subtaskID: this.#parentSubtask.id(),
          });
          const memory = meta.getMemoryFn();
          meta.returnFn.apply(null, [taskValue, meta.resultPtr]);
          meta.returnFnCalled = true;
        }
      }
      
      if (this.#postReturnFn) {
        _debugLog('[AsyncTask#onResolve()] running post return ', {
          componentIdx: this.#componentIdx,
          taskID: this.#id,
        });
        try {
          this.#postReturnFn(taskValue);
        } catch (err) {
          _debugLog("[AsyncTask#onResolve] error during task resolve handler", err);
          throw err;
        }
      }
      
      if (this.#parentSubtask) {
        this.#parentSubtask.onResolve(taskValue);
      }
    }
    
    registerOnResolveHandler(f) {
      this.#onResolveHandlers.push(f);
    }
    
    isRejected() { return this.#rejected; }
    
    isErrored() { return this.#errored; }
    setErrored(err) { this.#errored = err; }
    
    reject(taskErr) {
      _debugLog('[AsyncTask#reject()] args', {
        componentIdx: this.#componentIdx,
        taskID: this.#id,
        parentSubtask: this.#parentSubtask,
        parentSubtaskID: this.#parentSubtask?.id(),
        entryFnName: this.entryFnName(),
        callbackFnName: this.#callbackFnName,
        errMsg: taskErr.message,
      });
      
      if (this.isResolvedState() || this.#rejected) { return; }
      
      this.#rejected = true;
      this.cancelRequested = true;
      this.#state = AsyncTask.State.PENDING_CANCEL;
      const cancelled = this.deliverPendingCancel({ cancellable: true });
      
      // TODO: do cleanup here to reset the machinery so we can run again?
      
      this.cancel({ error: taskErr });
    }
    
    resolve(results) {
      _debugLog('[AsyncTask#resolve()] args', {
        componentIdx: this.#componentIdx,
        taskID: this.#id,
        entryFnName: this.entryFnName(),
        callbackFnName: this.#callbackFnName,
      });
      
      if (this.#state === AsyncTask.State.RESOLVED) {
        throw new Error(`(component [${this.#componentIdx}]) task [${this.#id}]  is already resolved (did you forget to wait for an import?)`);
      }
      
      if (this.borrowedHandles.length > 0) {
        throw new Error('task still has borrow handles');
      }
      
      this.#state = AsyncTask.State.RESOLVED;
      
      switch (results.length) {
        case 0:
        this.onResolve(undefined);
        break;
        case 1:
        this.onResolve(results[0]);
        break;
        default:
        _debugLog('[AsyncTask#resolve()] unexpected number of results', {
          componentIdx: this.#componentIdx,
          results,
          taskID: this.#id,
          subtaskID: this.#parentSubtask?.id(),
          entryFnName: this.#entryFnName,
          callbackFnName: this.#callbackFnName,
        });
        throw new Error('unexpected number of results');
      }
    }
    
    exit(args) {
      _debugLog('[AsyncTask#exit()]', {
        componentIdx: this.#componentIdx,
        taskID: this.#id,
      });
      
      if (this.#exited)  { throw new Error("task has already exited"); }
      
      if (this.#state !== AsyncTask.State.RESOLVED) {
        throw new Error(`(component [${this.#componentIdx}]) task [${this.#id}] exited without resolution`);
      }
      
      if (this.borrowedHandles > 0) {
        throw new Error('task [${this.#id}] exited without clearing borrowed handles');
      }
      
      const state = getOrCreateAsyncState(this.#componentIdx);
      if (!state) { throw new Error('missing async state for component [' + this.#componentIdx + ']'); }
      
      // Exempt the host from exclusive lock check
      if (this.#componentIdx !== -1 && !args?.skipExclusiveLockCheck) {
        if (this.needsExclusiveLock() && !state.isExclusivelyLocked()) {
          throw new Error(`task [${this.#id}] exit: component [${this.#componentIdx}] should have been exclusively locked`);
        }
      }
      
      state.exclusiveRelease();
      
      for (const f of this.#onExitHandlers) {
        try {
          f();
        } catch (err) {
          console.error("error during task exit handler", err);
          throw err;
        }
      }
      
      this.#exited = true;
      clearCurrentTask(this.#componentIdx, this.id());
    }
    
    needsExclusiveLock() {
      return !this.#isAsync || this.hasCallback();
    }
    
    createSubtask(args) {
      _debugLog('[AsyncTask#createSubtask()] args', args);
      const { componentIdx, childTask, callMetadata, fnName, isAsync, isManualAsync } = args;
      
      const cstate = getOrCreateAsyncState(this.#componentIdx);
      if (!cstate) {
        throw new Error(`invalid/missing async state for component idx [${componentIdx}]`);
      }
      
      const waitable = new Waitable({
        componentIdx: this.#componentIdx,
        target: `subtask (internal ID [${this.#id}])`,
      });
      
      const newSubtask = new AsyncSubtask({
        componentIdx,
        childTask,
        parentTask: this,
        callMetadata,
        isAsync,
        isManualAsync,
        fnName,
        waitable,
      });
      this.#subtasks.push(newSubtask);
      newSubtask.setTarget(`subtask (internal ID [${newSubtask.id()}], waitable [${waitable.idx()}], component [${componentIdx}])`);
      waitable.setIdx(cstate.handles.insert(newSubtask));
      waitable.setTarget(`waitable for subtask (waitable id [${waitable.idx()}], subtask internal ID [${newSubtask.id()}])`);
      return newSubtask;
    }
    
    getLatestSubtask() {
      return this.#subtasks.at(-1);
    }
    
    getSubtaskByWaitableRep(rep) {
      if (rep === undefined) { throw new TypeError('missing rep'); }
      return this.#subtasks.find(s => s.waitableRep() === rep);
    }
    
    currentSubtask() {
      _debugLog('[AsyncTask#currentSubtask()]');
      if (this.#subtasks.length === 0) { return undefined; }
      return this.#subtasks.at(-1);
    }
    
    removeSubtask(subtask) {
      if (this.#subtasks.length === 0) {
        throw new Error('cannot end current subtask: no current subtask');
      }
      this.#subtasks = this.#subtasks.filter(t => t !== subtask);
      return subtask;
    }
  }
  
  const ASYNC_EVENT_CODE = {
    NONE: 0,
    SUBTASK: 1,
    STREAM_READ: 2,
    STREAM_WRITE: 3,
    FUTURE_READ: 4,
    FUTURE_WRITE: 5,
    TASK_CANCELLED: 6,
  };
  
  function getCurrentTask(componentIdx, taskID) {
    let usedGlobal = false;
    if (componentIdx === undefined || componentIdx === null) {
      throw new Error('missing component idx'); // TODO(fix)
      // componentIdx = ASYNC_CURRENT_COMPONENT_IDXS.at(-1);
      // usedGlobal = true;
    }
    
    const taskMetas = ASYNC_TASKS_BY_COMPONENT_IDX.get(componentIdx);
    if (taskMetas === undefined || taskMetas.length === 0) { return undefined; }
    
    if (taskID) {
      return taskMetas.find(meta => meta.task.id() === taskID);
    }
    
    const taskMeta = taskMetas[taskMetas.length - 1];
    if (!taskMeta || !taskMeta.task) { return undefined; }
    
    return taskMeta;
  }
  
  const emptyFunc = () => {};
  
  let dv = new DataView(new ArrayBuffer());
  const dataView = mem => dv.buffer === mem.buffer ? dv : dv = new DataView(mem.buffer);
  
  function toInt64(val) {
    const converted = BigInt(val)
    
    return BigInt.asIntN(64, converted);
  }
  
  
  function toUint64(val) {
    const converted = BigInt(val)
    
    return BigInt.asUintN(64, converted);
  }
  
  
  function toUint16(val) {
    
    val >>>= 0;
    val %= 2 ** 16;
    return val;
  }
  
  
  function toUint32(val) {
    
    return val >>> 0;
  }
  
  
  function toUint8(val) {
    
    val >>>= 0;
    val %= 2 ** 8;
    return val;
  }
  
  const utf16Decoder = new TextDecoder('utf-16');
  const TEXT_DECODER_UTF8 = new TextDecoder();
  const TEXT_ENCODER_UTF8 = new TextEncoder();
  
  function _utf8AllocateAndEncode(s, realloc, memory) {
    if (typeof s !== 'string') {
      throw new TypeError('expected a string, received [' + typeof s + ']');
    }
    if (s.length === 0) { return { ptr: 1, len: 0 }; }
    let buf = TEXT_ENCODER_UTF8.encode(s);
    let ptr = realloc(0, 0, 1, buf.length);
    new Uint8Array(memory.buffer).set(buf, ptr);
    const res = { ptr, len: buf.length, codepoints: [...s].length };
    return res;
  }
  
  
  const T_FLAG = 1 << 30;
  
  function rscTableCreateOwn(table, rep) {
    const free = table[0] & ~T_FLAG;
    table._createdReps.add(rep);
    if (free === 0) {
      table.push(0);
      table.push(rep | T_FLAG);
      return (table.length >> 1) - 1;
    }
    table[0] = table[free << 1];
    table[free << 1] = 0;
    table[(free << 1) + 1] = rep | T_FLAG;
    return free;
  }
  
  function rscTableRemove(table, handle) {
    const scope = table[handle << 1];
    const val = table[(handle << 1) + 1];
    const own = (val & T_FLAG) !== 0;
    const rep = val & ~T_FLAG;
    if (val === 0 || (scope & T_FLAG) !== 0) {
      throw new TypeError("Invalid handle");
    }
    table[handle << 1] = table[0] | T_FLAG;
    table[0] = handle | T_FLAG;
    return { rep, scope, own };
  }
  
  let curResourceBorrows = [];
  
  function createNewCurrentTask(args) {
    _debugLog('[createNewCurrentTask()] args', args);
    const {
      componentIdx,
      isAsync,
      isManualAsync,
      entryFnName,
      parentSubtaskID,
      callbackFnName,
      getCallbackFn,
      getParamsFn,
      stringEncoding,
      errHandling,
      getCalleeParamsFn,
      resultPtr,
      callingWasmExport,
    } = args;
    if (componentIdx === undefined || componentIdx === null) {
      throw new Error('missing/invalid component instance index while starting task');
    }
    let taskMetas = ASYNC_TASKS_BY_COMPONENT_IDX.get(componentIdx);
    const callbackFn = getCallbackFn ? getCallbackFn() : null;
    
    const newTask = new AsyncTask({
      componentIdx,
      isAsync,
      isManualAsync,
      entryFnName,
      callbackFn,
      callbackFnName,
      stringEncoding,
      getCalleeParamsFn,
      resultPtr,
      errHandling,
    });
    
    const newTaskID = newTask.id();
    const newTaskMeta = { id: newTaskID, componentIdx, task: newTask };
    
    // NOTE: do not track host tasks
    ASYNC_CURRENT_TASK_IDS.push(newTaskID);
    ASYNC_CURRENT_COMPONENT_IDXS.push(componentIdx);
    
    if (!taskMetas) {
      taskMetas = [newTaskMeta];
      ASYNC_TASKS_BY_COMPONENT_IDX.set(componentIdx, [newTaskMeta]);
    } else {
      taskMetas.push(newTaskMeta);
    }
    
    return [newTask, newTaskID];
  }
  
  function _lowerImportBackwardsCompat(args) {
    const params = [...arguments].slice(1);
    _debugLog('[_lowerImportBackwardsCompat()] args', { args, params });
    const {
      functionIdx,
      componentIdx,
      isAsync,
      isManualAsync,
      paramLiftFns,
      resultLowerFns,
      hasResultPointer,
      funcTypeIsAsync,
      metadata,
      memoryIdx,
      getMemoryFn,
      getReallocFn,
      importFn,
      stringEncoding,
    } = args;
    
    let meta = _getGlobalCurrentTaskMeta(componentIdx);
    let createdTask;
    
    // Some components depend on initialization logic (i.e. `_initialize` or some such
    // core wasm export) that is embedded in the component, but is not executed or wizer'd
    // away before the transpiled component is attempted to be used.
    //
    // These components execut their initialization logic *when they are imported* in the
    // transpiled context -- so we may get a call to an export that is lowered without going
    // through `CallWasm` or `CallInterface`.
    //
    if (!meta) {
      if (funcTypeIsAsync || (isAsync && !isManualAsync)) {
        throw new Error('p3 async wasm exports cannot use backwards compat auto-task init');
      }
      
      const [newTask, newTaskID] = createNewCurrentTask({
        componentIdx,
        isAsync,
        isManualAsync,
        callingWasmExport: false,
      });
      createdTask = newTask;
      
      // Since we're managing the task creation ourselves we must clear ourselves
      createdTask.registerOnResolveHandler(() => {
        _clearCurrentTask({
          taskID: task.id(),
          componentIdx: task.componentIdx(),
        });
      });
      
      _setGlobalCurrentTaskMeta({
        componentIdx,
        taskID: newTaskID,
      });
      
      meta = _getGlobalCurrentTaskMeta(componentIdx);
    }
    
    const { taskID } = meta;
    
    const taskMeta = getCurrentTask(componentIdx, taskID);
    if (!taskMeta) {
      throw new Error('invalid/missing async task meta');
    }
    
    const task = taskMeta.task;
    if (!task) { throw new Error('invalid/missing async task'); }
    
    const cstate = getOrCreateAsyncState(componentIdx);
    
    // TODO: re-enable this check -- postReturn can call imports though,
    // and that breaks things.
    //
    // if (!cstate.mayLeave) {
      //     throw new Error(`cannot leave instance [${componentIdx}]`);
      // }
      
      if (!task.mayBlock() && funcTypeIsAsync && !isAsync) {
        throw new Error("non async exports cannot synchronously call async functions");
      }
      
      // If there is an existing task, this should be part of a subtask
      const memory = getMemoryFn();
      // Canonical ABI lower appends result storage as a trailing
      // param when async lower has any flat result, or sync lower
      // has more than one flat result.
      const resultPtr = hasResultPointer ? params[params.length - 1] : undefined;
      const subtask = task.createSubtask({
        componentIdx,
        parentTask: task,
        fnName: importFn.fnName,
        isAsync,
        isManualAsync,
        callMetadata: {
          memoryIdx,
          memory,
          realloc: getReallocFn?.(),
          getReallocFn,
          resultPtr,
          lowers: resultLowerFns,
          stringEncoding,
        }
      });
      task.setReturnMemoryIdx(memoryIdx);
      task.setReturnMemory(getMemoryFn());
      
      subtask.onStart();
      
      // If dealing with a sync lowered sync function, we can directly return results
      //
      // TODO(breaking): remove once we get rid of manual async import specification,
      // as func types cannot be detected in that case only (and we don't need that w/ p3)
      if (!isManualAsync && !isAsync && !funcTypeIsAsync) {
        if (createdTask) { createdTask.enterSync(); }
        
        const res = importFn(...params);
        
        // TODO(breaking): remove once we get rid of manual async import specification,
        // as func types cannot be detected in that case only (and we don't need that w/ p3)
        if (!funcTypeIsAsync && !subtask.isReturned()) {
          throw new Error('post-execution subtasks must either be async or returned');
        }
        
        const syncRes = subtask.getResult();
        if (createdTask) { createdTask.resolve([syncRes]); }
        
        return syncRes;
      }
      
      // Sync-lowered async functions requires async behavior because the callee *can* block,
      // but this call must *act* synchronously and return immediately with the result
      // (i.e. not returning until the work is done)
      //
      // TODO(breaking): remove checking for manual async specification here, once we can go p3-only
      //
      if (!isManualAsync && !isAsync && funcTypeIsAsync) {
        const { promise, resolve } = new Promise();
        queueMicrotask(async () => {
          if (!subtask.isResolvedState()) {
            await task.suspendUntil({ readyFn: () => task.isResolvedState() });
          }
          resolve(subtask.getResult());
        });
        return promise;
      }
      
      // NOTE: at this point we know that we are working with an async lowered import
      
      const subtaskState = subtask.getStateNumber();
      if (subtaskState < 0 || subtaskState >= 2**4) {
        throw new Error('invalid subtask state, out of valid range');
      }
      
      subtask.setOnProgressFn(() => {
        subtask.setPendingEvent(() => {
          if (subtask.isResolved()) { subtask.deliverResolve(); }
          const event = {
            code: ASYNC_EVENT_CODE.SUBTASK,
            payload0: subtask.waitableRep(),
            payload1: subtask.getStateNumber(),
          }
          return event;
        });
      });
      
      // This is a hack to maintain backwards compatibility with
      // manually-specified async imports, used in wasm exports that are
      // not actually async (but are specified as so).
      //
      // This is not normal p3 sync behavior but instead anticipating that
      // the caller that is doing manual async will be waiting for a promise that
      // resolves to the *actual* result.
      //
      // TODO(breaking): remove once manually specified async is removed
      //
      // There are a few cases:
      // 1. sync function with async types (e.g. `f: func() -> stream<u32>`)
      // 2. async function with async types (e.g. `f: async func() -> stream<u32>`)
      // 3. async function with sync types (e.g. `f: async func() -> list<u32>`)
      // 4. sync function with non-async types (e.g. `f: func() -> list<u32>`)
      //
      // This hack *only* applies to 4 -- the case where an async JS host function
      // is supplied to a Wasm export which does *not* need to do any async abi
      // lifting/lowering (async ABI did not exist when JSPI integratiton was
      // initially merged to enable asynchronously returning values from the host)
      //
      const requiresManualAsyncResult = !isAsync && !funcTypeIsAsync && isManualAsync;
      let manualAsyncResult;
      if (requiresManualAsyncResult) {
        manualAsyncResult = promiseWithResolvers();
      }
      
      queueMicrotask(async () => {
        try {
          _debugLog('[_lowerImportBackwardsCompat()] calling lowered import', { importFn, params });
          if (createdTask) { await createdTask.enter(); }
          
          const asyncRes = await importFn(...params);
          if (requiresManualAsyncResult) {
            manualAsyncResult.resolve(subtask.getResult());
          }
          
          if (createdTask) { createdTask.resolve([asyncRes]); }
          
          
        } catch (err) {
          _debugLog("[_lowerImportBackwardsCompat()] import fn error:", err);
          if (requiresManualAsyncResult) {
            manualAsyncResult.reject(err);
          }
          throw err;
        }
      });
      
      if (requiresManualAsyncResult) { return manualAsyncResult.promise; }
      
      return Number(subtask.waitableRep()) << 4 | subtaskState;
    }
    
    function _liftFlatBool(ctx) {
      _debugLog('[_liftFlatBool()] args', { ctx });
      let val;
      
      if (ctx.useDirectParams) {
        if (ctx.params.length === 0) { throw new Error('expected at least a single i32 argument'); }
        val = ctx.params[0] === 1;
        ctx.params = ctx.params.slice(1);
        return [val, ctx];
      }
      
      if (ctx.storageLen !== undefined && ctx.storageLen < 1) {
        throw new Error(`insufficient storage ([${ctx.storageLen}] bytes) for lift (bool requires 1 byte)`);
      }
      
      val = new DataView(ctx.memory.buffer).getUint8(ctx.storagePtr, true) === 1;
      
      ctx.storagePtr += 1;
      if (ctx.storageLen !== undefined) { ctx.storageLen -= 1; }
      
      return [val, ctx];
    }
    
    
    function _liftFlatU8(ctx) {
      _debugLog('[_liftFlatU8()] args', { ctx });
      let val;
      
      if (ctx.useDirectParams) {
        if (ctx.params.length === 0) { throw new Error('expected at least a single i32 argument'); }
        val = ctx.params[0];
        ctx.params = ctx.params.slice(1);
        return [val, ctx];
      }
      
      if (ctx.storageLen !== undefined && ctx.storageLen < 1) {
        throw new Error(`insufficient storage ([${ctx.storageLen}] bytes) for lift (u8 requires 1 byte)`);
      }
      
      val = new DataView(ctx.memory.buffer).getUint8(ctx.storagePtr, true);
      
      ctx.storagePtr += 1;
      if (ctx.storageLen !== undefined) { ctx.storageLen -= 1; }
      
      return [val, ctx];
    }
    
    
    function _liftFlatU16(ctx) {
      _debugLog('[_liftFlatU16()] args', { ctx });
      let val;
      
      if (ctx.useDirectParams) {
        if (ctx.params.length === 0) { throw new Error('expected at least a single i32 argument'); }
        val = ctx.params[0];
        ctx.params = ctx.params.slice(1);
        return [val, ctx];
      }
      
      if (ctx.storageLen !== undefined && ctx.storageLen < 2) {
        throw new Error(`insufficient storage ([${ctx.storageLen}] bytes) for lift (u16 requires 2 bytes)`);
      }
      
      val = new DataView(ctx.memory.buffer).getUint16(ctx.storagePtr, true);
      
      ctx.storagePtr += 2;
      if (ctx.storageLen !== undefined) { ctx.storageLen -= 2; }
      
      const rem = ctx.storagePtr % 2;
      if (rem !== 0) { ctx.storagePtr += (2 - rem); }
      
      return [val, ctx];
    }
    
    
    function _liftFlatU32(ctx) {
      _debugLog('[_liftFlatU32()] args', { ctx });
      let val;
      
      if (ctx.useDirectParams) {
        if (ctx.params.length === 0) { throw new Error('expected at least a single i34 argument'); }
        val = ctx.params[0];
        ctx.params = ctx.params.slice(1);
        return [val, ctx];
      }
      
      if (ctx.storageLen !== undefined && ctx.storageLen < 4) {
        throw new Error(`insufficient storage ([${ctx.storageLen}] bytes) for lift (u32 requires 4 bytes)`);
      }
      val = new DataView(ctx.memory.buffer).getUint32(ctx.storagePtr, true);
      ctx.storagePtr += 4;
      if (ctx.storageLen !== undefined) { ctx.storageLen -= 4; }
      
      return [val, ctx];
    }
    
    
    function _liftFlatS64(ctx) {
      _debugLog('[_liftFlatS64()] args', { ctx });
      let val;
      
      if (ctx.useDirectParams) {
        if (ctx.params.length === 0) { throw new Error('expected at least one single i64 argument'); }
        if (typeof ctx.params[0] !== 'bigint') { throw new Error('expected bigint'); }
        val = ctx.params[0];
        ctx.params = ctx.params.slice(1);
        return [val, ctx];
      }
      
      
      if (ctx.storageLen !== undefined && ctx.storageLen < 8) {
        throw new Error(`insufficient storage ([${ctx.storageLen}] bytes) for lift (s64 requires 8 bytes)`);
      }
      
      val = new DataView(ctx.memory.buffer).getBigInt64(ctx.storagePtr, true);
      ctx.storagePtr += 8;
      if (ctx.storageLen !== undefined) { ctx.storageLen -= 8; }
      
      return [val, ctx];
    }
    
    
    function _liftFlatU64(ctx) {
      _debugLog('[_liftFlatU64()] args', { ctx });
      let val;
      
      if (ctx.useDirectParams) {
        if (ctx.params.length === 0) { throw new Error('expected at least one single i64 argument'); }
        if (typeof ctx.params[0] !== 'bigint') { throw new Error('expected bigint'); }
        val = ctx.params[0];
        ctx.params = ctx.params.slice(1);
        return [val, ctx];
      }
      
      if (ctx.storageLen !== undefined && ctx.storageLen < 8) {
        throw new Error(`insufficient storage ([${ctx.storageLen}] bytes) for lift (u64 requires 8 bytes)`);
      }
      
      val = new DataView(ctx.memory.buffer).getBigUint64(ctx.storagePtr, true);
      ctx.storagePtr += 8;
      if (ctx.storageLen !== undefined) { ctx.storageLen -= 8; }
      
      return [val, ctx];
    }
    
    
    function _liftFlatFloat64(ctx) {
      _debugLog('[_liftFlatFloat64()] args', { ctx });
      let val;
      
      if (ctx.useDirectParams) {
        if (ctx.params.length === 0) {
          throw new Error('expected at least one single f64 argument');
        }
        val = ctx.params[0];
        ctx.params = ctx.params.slice(1);
        
        if (ctx.inVariant) {
          const dv = new DataView(new ArrayBuffer(8));
          dv.setBigInt64(0, val);
          val = dv.getFloat64(0);
        }
        
        return [val, ctx];
      }
      
      if (ctx.storageLen !== undefined && ctx.storageLen < 8) {
        throw new Error(`insufficient storage ([${ctx.storageLen}] bytes) for lift (f64 requires 8 bytes)`);
      }
      
      val = new DataView(ctx.memory.buffer).getFloat64(ctx.storagePtr, true);
      ctx.storagePtr += 8;
      if (ctx.storageLen !== undefined) { ctx.storageLen -= 8; }
      
      return [val, ctx];
    }
    
    
    function _liftFlatStringAny(ctx) {
      switch (ctx.stringEncoding) {
        case 'utf8':
        return _liftFlatStringUTF8(ctx);
        case 'utf16':
        return _liftFlatStringUTF16(ctx);
        default:
        throw new Error(`missing/unrecognized/unsupported string encoding [${ctx.stringEncoding}]`);
      }
    }
    
    function _liftFlatStringUTF8(ctx) {
      _debugLog('[_liftFlatStringUTF8()] args', { ctx });
      let val;
      
      if (ctx.useDirectParams) {
        if (ctx.params.length < 2) { throw new Error('expected at least two u32 arguments'); }
        let offset = ctx.params[0];
        if (typeof offset === 'bigint') { offset = Number(offset); }
        if (!Number.isSafeInteger(offset)) { throw new Error('invalid offset'); }
        const len = ctx.params[1];
        if (!Number.isSafeInteger(len)) {  throw new Error('invalid len'); }
        val = TEXT_DECODER_UTF8.decode(new DataView(ctx.memory.buffer, offset, len));
        ctx.params = ctx.params.slice(2);
        return [val, ctx];
      }
      
      const rem = ctx.storagePtr % 4;
      if (rem !== 0) { ctx.storagePtr += (4 - rem); }
      
      const dv = new DataView(ctx.memory.buffer);
      const start = dv.getUint32(ctx.storagePtr, true);
      const codeUnits = dv.getUint32(ctx.storagePtr + 4, true);
      
      val = TEXT_DECODER_UTF8.decode(new Uint8Array(ctx.memory.buffer, start, codeUnits));
      
      ctx.storagePtr += 8;
      if (ctx.storageLen !== undefined) { ctx.storagelen -= 8; }
      
      return [val, ctx];
    }
    
    function _liftFlatStringUTF16(ctx) {
      _debugLog('[_liftFlatStringUTF16()] args', { ctx });
      let val;
      
      if (ctx.useDirectParams) {
        if (ctx.params.length < 2) { throw new Error('expected at least two u32 arguments'); }
        let offset = ctx.params[0];
        if (typeof offset === 'bigint') { offset = Number(offset); }
        if (!Number.isSafeInteger(offset)) {  throw new Error('invalid offset'); }
        const len = ctx.params[1];
        if (!Number.isSafeInteger(len)) {  throw new Error('invalid len'); }
        val = utf16Decoder.decode(new DataView(ctx.memory.buffer, offset, len));
        ctx.params = ctx.params.slice(2);
        return [val, ctx];
      }
      
      const data = new DataView(ctx.memory.buffer)
      const start = data.getUint32(ctx.storagePtr, vals[0], true);
      const codeUnits = data.getUint32(ctx.storagePtr, vals[0] + 4, true);
      val = utf16Decoder.decode(new Uint16Array(ctx.memory.buffer, start, codeUnits));
      ctx.storagePtr = ctx.storagePtr + 2 * codeUnits;
      if (ctx.storageLen !== undefined) { ctx.storageLen = ctx.storageLen - 2 * codeUnits }
      
      return [val, ctx];
    }
    
    function _liftFlatRecord(meta) {
      const { fieldMetas, size32: recordSize32, align32: recordAlign32 } = meta;
      return function _liftFlatRecordInner(ctx) {
        _debugLog('[_liftFlatRecord()] args', { ctx });
        
        const originalPtr = ctx.storagePtr;
        const res = {};
        for (const [key, liftFn, size32, align32] of fieldMetas) {
          let fieldPtr;
          if (ctx.storagePtr !== undefined) {
            const rem = ctx.storagePtr % align32;
            if (rem !== 0) { ctx.storagePtr += align32 - rem; }
            fieldPtr = ctx.storagePtr;
          }
          
          // A field occupies exactly size32 bytes of the record's
          // flat storage. Capture the remaining storage budget before
          // lifting the field and restore it afterwards: a field's own
          // lift fn may repurpose storageLen internally (e.g. a list
          // sets it to the element-buffer length while reading
          // out-of-line data and never restores it), which would
          // otherwise corrupt the budget the next field sees.
          // See https://github.com/bytecodealliance/jco/issues/1585.
          let fieldLen;
          if (ctx.storageLen !== undefined) { fieldLen = ctx.storageLen; }
          
          let [val, newCtx] = liftFn(ctx);
          res[key] = val;
          ctx = newCtx;
          
          if (fieldPtr !== undefined) {
            ctx.storagePtr = Math.max(ctx.storagePtr, fieldPtr + size32);
          }
          if (fieldLen !== undefined) {
            ctx.storageLen = fieldLen - size32;
          }
        }
        
        if (originalPtr !== undefined) {
          ctx.storagePtr = Math.max(ctx.storagePtr, originalPtr + recordSize32);
        }
        
        if (ctx.storagePtr !== undefined) {
          const rem = ctx.storagePtr % recordAlign32;
          if (rem !== 0) { ctx.storagePtr += recordAlign32 - rem; }
        }
        
        return [res, ctx];
      }
    }
    
    function _liftFlatVariant(meta) {
      const {
        caseMetas,
        variantSize32,
        variantAlign32,
        variantPayloadOffset32,
        variantFlatCount,
        isEnum,
      } = meta;
      
      return function _liftFlatVariantInner(ctx) {
        _debugLog('[_liftFlatVariant()] args', { ctx });
        const origUseParams = ctx.useDirectParams;
        
        // If we're in the process of lifting a variant, we note
        // we are during any lifting that happens (e.g. to accomodate f32/f64 mechanics)
        const wasInVariant = ctx.inVariant;
        ctx.inVariant = true;
        
        let caseIdx;
        let liftRes;
        const originalPtr = ctx.storagePtr;
        const numCases =  caseMetas.length;
        if (caseMetas.length < 256) {
          liftRes = _liftFlatU8(ctx);
        } else if (numCases >= 256 && numCases < 65536) {
          liftRes = _liftFlatU16(ctx);
        } else if (numCases >= 65536 && numCases < 4_294_967_296) {
          liftRes = _liftFlatU32(ctx);
        } else {
          throw new Error(`unsupported number of variant cases [${numCases}]`);
        }
        caseIdx = liftRes[0];
        ctx = liftRes[1];
        
        const [
        tag,
        liftFn,
        caseSize32,
        caseAlign32,
        caseFlatCount,
        ] = caseMetas[caseIdx];
        
        if (variantPayloadOffset32 === undefined) {
          throw new Error('unexpectedly missing payload offset');
        }
        
        if (originalPtr !== undefined) {
          ctx.storagePtr = originalPtr + variantPayloadOffset32;
        }
        
        let val;
        if (liftFn === null) {
          val = { tag };
          // NOTE: here we need to move past the entire object in memory
          // despite moving to the payload which we now know is missing/unnecessary
          if (originalPtr !== undefined) {
            ctx.storagePtr = originalPtr + variantSize32;
          }
        } else {
          if (ctx.useDirectParams && ctx.params && liftFn !== _liftFlatFloat64 && typeof ctx.params[0] === 'bigint') {
            if (ctx.params[0] > BigInt(Number.MAX_SAFE_INTEGER)) {
              throw new Error(`invalid value, reinterpreted i32/f32 too large: [${ctx.params[0]}]`);
            }
            ctx.params[0] = Number(ctx.params[0]);
          }
          
          const [newVal, newCtx] = liftFn(ctx);
          val = { tag, val: newVal };
          ctx = newCtx;
        }
        
        if (origUseParams) {
          if (variantFlatCount === undefined || variantFlatCount === null) {
            _debugLog('[_liftFlatVariant()] variant with unknown flat count', { ctx, meta });
            throw new Error('cannot lift variant with unknown flat count');
          }
          if (caseFlatCount === undefined || caseFlatCount === null) {
            _debugLog('[_liftFlatVariant()] case with unknown flat count', { ctx, meta, case: meta.caseMetas[caseIdx] });
            throw new Error('cannot lift case with unknown flat count');
          }
          // NOTE: enums can be tightly packed and do not have a descriminant
          const remainingPayloadParams = variantFlatCount - caseFlatCount - (isEnum ? 0 : 1);
          if (remainingPayloadParams < 0) {
            throw new Error(`invalid variant flat count metadata`);
          }
          if (ctx.params.length < remainingPayloadParams) {
            throw new Error(`expected at least [${remainingPayloadParams}] remaining variant payload params, but got [${ctx.params.length}]`);
          }
          ctx.params = ctx.params.slice(remainingPayloadParams);
        }
        
        if (ctx.storagePtr !== undefined) {
          const rem = ctx.storagePtr % variantAlign32;
          if (rem !== 0) { ctx.storagePtr += variantAlign32 - rem; }
        }
        
        ctx.inVariant = wasInVariant;
        
        return [val, ctx];
      }
    }
    
    function _liftFlatList(meta) {
      const { elemLiftFn, elemSize32, elemAlign32, knownLen, typedArray } = meta;
      
      const listValue =
      typedArray === undefined
      ? values => values
      : values => new typedArray(values);
      
      const readValuesAndReset = (ctx, originalPtr, originalLen, dataPtr, len) => {
        ctx.storagePtr = dataPtr;
        const val = [];
        for (var i = 0; i < len; i++) {
          const elemPtr = dataPtr + i * elemSize32;
          ctx.storagePtr = elemPtr;
          const [res, nextCtx] = elemLiftFn(ctx);
          val.push(res);
          ctx = nextCtx;
          
          ctx.storagePtr = Math.max(ctx.storagePtr, elemPtr + elemSize32);
        }
        if (originalPtr !== null) { ctx.storagePtr = originalPtr; }
        if (originalLen !== null) { ctx.storageLen = originalLen; }
        return [listValue(val), ctx];
      };
      
      return function _liftFlatListInner(ctx) {
        _debugLog('[_liftFlatList()] args', { ctx });
        
        let liftResults;
        if (knownLen !== undefined) { // list with known length
        if (ctx.useDirectParams) {
          _debugLog('memory unexpectedly missing while lifting unknown length list', { ctx });
          liftResults = [listValue(ctx.params.slice(0, knownLen)), ctx];
          ctx.params = ctx.params.slice(knownLen);
        } else { // indirect params
        if (ctx.memory === null) {
          _debugLog('memory unexpectedly missing while lifting known length list', { knownLen, ctx });
          throw new Error(`memory missing while lifting known length (${knownLen}) list`);
        }
        
        const originalLen = ctx.storageLen;
        const originalPtr = ctx.storagePtr;
        
        ctx.storageLen = knownLen * elemSize32;
        liftResults = readValuesAndReset(ctx, null, originalLen, ctx.storagePtr, knownLen);
      }
      
    } else { // unknown length list
    
    if (ctx.useDirectParams) {
      // unknown length list ptr w/ direct params
      const dataPtr = ctx.params[0];
      const len = ctx.params[1];
      ctx.params = ctx.params.slice(2);
      
      ctx.useDirectParams = false;
      const originalPtr = ctx.storagePtr;
      const originalLen = ctx.storageLen;
      ctx.storageLen = len * elemSize32;
      
      liftResults = readValuesAndReset(ctx, originalPtr, originalLen, dataPtr, len);
      
      ctx.useDirectParams = true;
    } else {
      // unknown length list ptr w/ in-memory params
      const originalLen = ctx.storageLen;
      ctx.storageLen = 8;
      
      const dataPtrLiftRes = _liftFlatU32(ctx);
      const dataPtr = dataPtrLiftRes[0];
      ctx = dataPtrLiftRes[1];
      
      const lenLiftRes = _liftFlatU32(ctx);
      const len = lenLiftRes[0];
      ctx = lenLiftRes[1];
      
      const originalPtr = ctx.storagePtr;
      ctx.storagePtr = dataPtr;
      
      ctx.storageLen = len * elemSize32;
      liftResults = readValuesAndReset(ctx, originalPtr, originalLen, dataPtr, len);
    }
  }
  
  return liftResults;
}
}

function _liftFlatTuple(meta) {
  const { elemLiftFns, size32: tupleSize32, align32: tupleAlign32 } = meta;
  return function _liftFlatTupleInner(ctx) {
    _debugLog('[_liftFlatTuple()] args', { ctx });
    
    const originalPtr = ctx.storagePtr;
    const val = [];
    for (const [ liftFn, size32, align32 ]  of elemLiftFns) {
      let elemPtr;
      if (ctx.storagePtr !== undefined) {
        const rem = ctx.storagePtr % align32;
        if (rem !== 0) { ctx.storagePtr += align32 - rem; }
        elemPtr = ctx.storagePtr;
      }
      
      // As in _liftFlatRecord: an element occupies exactly size32
      // bytes of the tuple's flat storage, so capture and restore
      // the storage budget around the element lift to stop a
      // field's internal storageLen use (e.g. lists) leaking into
      // the next element.
      // See https://github.com/bytecodealliance/jco/issues/1585.
      let elemLen;
      if (ctx.storageLen !== undefined) { elemLen = ctx.storageLen; }
      
      const [newValue, newCtx] = liftFn(ctx);
      val.push(newValue);
      ctx = newCtx;
      
      if (elemPtr !== undefined) {
        ctx.storagePtr = Math.max(ctx.storagePtr, elemPtr + size32);
      }
      if (elemLen !== undefined) {
        ctx.storageLen = elemLen - size32;
      }
    }
    
    if (originalPtr !== undefined) {
      ctx.storagePtr = Math.max(ctx.storagePtr, originalPtr + tupleSize32);
    }
    
    if (ctx.storagePtr !== undefined) {
      const rem = ctx.storagePtr % tupleAlign32;
      if (rem !== 0) { ctx.storagePtr += tupleAlign32 - rem; }
    }
    
    return [val, ctx];
  }
}

function _liftFlatOption(meta) {
  const f = _liftFlatVariant(meta);
  return function _liftFlatOptionInner(ctx) {
    _debugLog('[_liftFlatOption()] args', { ctx });
    return f(ctx);
  }
}

function _liftFlatResult(meta) {
  const f = _liftFlatVariant(meta);
  return function _liftFlatResultInner(ctx) {
    _debugLog('[_liftFlatResult()] args', { ctx });
    return f(ctx);
  }
}

function _liftFlatOwn(meta) {
  const { className, createResourceFn, componentIdx } = meta;
  
  return function _liftFlatOwnInner(ctx) {
    _debugLog('[_liftFlatOwn()] args', { ctx, className });
    
    if (ctx.componentIdx !== componentIdx) {
      throw new Error('invalid component for resource lift');
    }
    
    const [handle, newCtx] = _liftFlatU32(ctx);
    const resource = createResourceFn(handle);
    
    return [resource, newCtx];
  }
}

function _liftFlatBorrow(componentTableIdx, size, memory, vals, storagePtr, storageLen) {
  _debugLog('[_liftFlatBorrow()] args', { size, memory, vals, storagePtr, storageLen });
  throw new Error('flat lift for borrowed resources is not supported!');
}


function _lowerFlatBool(ctx) {
  _debugLog('[_lowerFlatBool()] args', { ctx });
  
  if (!ctx.memory) { throw new Error("missing memory for lower"); }
  if (ctx.vals.length !== 1) {
    throw new Error(`unexpected number [${ctx.vals.length}] of vals (expected 1)`);
  }
  
  _requireValidNumericPrimitive.bind('bool', ctx.vals[0]);
  new DataView(ctx.memory.buffer).setUint32(ctx.storagePtr, ctx.vals[0], true);
  
  ctx.storagePtr += 1;
}

function _lowerFlatU8(ctx) {
  _debugLog('[_lowerFlatU8()] args', ctx);
  
  if (ctx.vals.length !== 1) {
    throw new Error(`unexpected number [${ctx.vals.length}] of vals (expected 1)`);
  }
  
  _requireValidNumericPrimitive.bind('u8', ctx.vals[0]);
  
  if (!ctx.memory) { throw new Error("missing memory for lower"); }
  new DataView(ctx.memory.buffer).setUint32(ctx.storagePtr, ctx.vals[0], true);
  
  ctx.storagePtr += 1;
}

function _lowerFlatU16(ctx) {
  _debugLog('[_lowerFlatU16()] args', { ctx });
  
  if (!ctx.memory) { throw new Error("missing memory for lower"); }
  if (ctx.vals.length !== 1) {
    throw new Error(`unexpected number [${ctx.vals.length}] of vals (expected 1)`);
  }
  
  const rem = ctx.storagePtr % 2;
  if (rem !== 0) { ctx.storagePtr += (2 - rem); }
  
  _requireValidNumericPrimitive.bind('u16', ctx.vals[0]);
  new DataView(ctx.memory.buffer).setUint16(ctx.storagePtr, ctx.vals[0], true);
  
  ctx.storagePtr += 2;
}

function _lowerFlatU32(ctx) {
  _debugLog('[_lowerFlatU32()] args', { ctx });
  
  if (ctx.vals.length !== 1) {
    throw new Error(`expected single value to lower, got [${ctx.vals.length}]`);
  }
  
  const rem = ctx.storagePtr % 4;
  if (rem !== 0) { ctx.storagePtr += (4 - rem); }
  
  _requireValidNumericPrimitive.bind('u32', ctx.vals[0]);
  new DataView(ctx.memory.buffer).setUint32(ctx.storagePtr, ctx.vals[0], true);
  
  ctx.storagePtr += 4;
}

function _lowerFlatS64(ctx) {
  _debugLog('[_lowerFlatS64()] args', { ctx });
  
  if (ctx.vals.length !== 1) { throw new Error('unexpected number of vals'); }
  
  const rem = ctx.storagePtr % 8;
  if (rem !== 0) { ctx.storagePtr += (8 - rem); }
  
  _requireValidNumericPrimitive.bind('s64', ctx.vals[0]);
  new DataView(ctx.memory.buffer).setBigInt64(ctx.storagePtr, ctx.vals[0], true);
  
  
  ctx.storagePtr += 8;
}

function _lowerFlatU64(ctx) {
  _debugLog('[_lowerFlatU64()] args', { ctx });
  
  if (ctx.vals.length !== 1) { throw new Error('unexpected number of vals'); }
  
  const rem = ctx.storagePtr % 8;
  if (rem !== 0) { ctx.storagePtr += (8 - rem); }
  
  _requireValidNumericPrimitive.bind('u64', ctx.vals[0]);
  new DataView(ctx.memory.buffer).setBigUint64(ctx.storagePtr, ctx.vals[0], true);
  
  ctx.storagePtr += 8;
}

function _lowerFlatFloat64(ctx) {
  _debugLog('[_lowerFlatFloat64()] args', { ctx });
  
  if (ctx.vals.length !== 1) { throw new Error('unexpected number of vals'); }
  
  const rem = ctx.storagePtr % 8;
  if (rem !== 0) { ctx.storagePtr += (8 - rem); }
  
  _requireValidNumericPrimitive.bind('f64', ctx.vals[0]);
  new DataView(ctx.memory.buffer).setFloat64(ctx.storagePtr, ctx.vals[0], true);
  
  ctx.storagePtr += 8;
}

function _lowerFlatStringAny(ctx) {
  switch (ctx.stringEncoding) {
    case 'utf8':
    return _lowerFlatStringUTF8(ctx);
    case 'utf16':
    return _lowerFlatStringUTF16(ctx);
    default:
    throw new Error(`missing/unrecognized/unsupported string encoding [${ctx.stringEncoding}]`);
  }
}

function _lowerFlatStringUTF8(ctx) {
  _debugLog('[_lowerFlatStringUTF8()] args', ctx);
  if (!ctx.realloc) { throw new Error('missing realloc during flat string lower'); }
  
  const s = ctx.vals[0];
  const { ptr, codepoints } = _utf8AllocateAndEncode(ctx.vals[0], ctx.realloc, ctx.memory);
  
  const view = new DataView(ctx.memory.buffer);
  view.setUint32(ctx.storagePtr, ptr, true);
  view.setUint32(ctx.storagePtr + 4, codepoints, true);
  
  ctx.storagePtr += 8;
}

function _lowerFlatStringUTF16(ctx) {
  _debugLog('[_lowerFlatStringUTF16()] args', { ctx });
  if (!ctx.realloc) { throw new Error('missing realloc during flat string lower'); }
  
  const s = ctx.vals[0];
  const { ptr, len, codepoints } = _utf16AllocateAndEncode(ctx.vals[0], ctx.realloc, ctx.memory);
  
  const view = new DataView(ctx.memory.buffer);
  view.setUint32(ctx.storagePtr, ptr, true);
  view.setUint32(ctx.storagePtr + 4, codepoints, true);
  
  const bytes = new Uint16Array(ctx.memory.buffer, start, codeUnits);
  if (ctx.memory.buffer.byteLength < start + bytes.byteLength) {
    throw new Error('memory out of bounds');
  }
  if (ctx.storageLen !== undefined && ctx.storageLen !== bytes.byteLength) {
    throw new Error(`storage length [${ctx.storageLen}] != [${bytes.byteLength}])`);
  }
  new Uint16Array(ctx.memory.buffer, ctx.storagePtr).set(bytes);
  
  ctx.storagePtr += len;
}

function _lowerFlatRecord(meta) {
  const { fieldMetas, size32: recordSize32, align32: recordAlign32 } = meta;
  return function _lowerFlatRecordInner(ctx) {
    _debugLog('[_lowerFlatRecord()] args', { ctx });
    
    const originalPtr = ctx.storagePtr;
    const r = ctx.vals[0];
    for (const [tag, lowerFn, size32, align32 ] of fieldMetas) {
      const rem = ctx.storagePtr % align32;
      if (rem !== 0) { ctx.storagePtr += align32 - rem; }
      
      const fieldPtr = ctx.storagePtr;
      ctx.vals = [r[tag]];
      lowerFn(ctx);
      
      ctx.storagePtr = Math.max(ctx.storagePtr, fieldPtr + size32);
    }
    
    ctx.storagePtr = Math.max(ctx.storagePtr, originalPtr + recordSize32);
    
    const rem = ctx.storagePtr % recordAlign32;
    if (rem !== 0) {
      ctx.storagePtr += recordAlign32 - rem;
    }
  }
}

function _lowerFlatVariant(meta) {
  const { variantSize32, variantAlign32, variantPayloadOffset32, caseMetas } = meta;
  
  let caseLookup = {};
  for (const [idx, meta] of caseMetas.entries()) {
    let tag = meta[0];
    caseLookup[tag] = { discriminant: idx, meta };
  }
  
  return function _lowerFlatVariantInner(ctx) {
    _debugLog('[_lowerFlatVariant()] args', { ctx });
    
    const { tag, val } = ctx.vals[0];
    const variantCase = caseLookup[tag];
    if (!variantCase) {
      throw new Error(`missing tag [${tag}] (valid tags: ${Object.keys(caseLookup)})`);
    }
    
    const [ _tag, lowerFn, caseSize32, caseAlign32, caseFlatCount ] = variantCase.meta;
    
    const originalPtr = ctx.storagePtr;
    ctx.vals = [variantCase.discriminant];
    let discLowerRes;
    if (caseMetas.length < 256) {
      discLowerRes = _lowerFlatU8(ctx);
    } else if (caseMetas.length >= 256 && caseMetas.length < 65536) {
      discLowerRes = _lowerFlatU16(ctx);
    } else if (caseMetas.length >= 65536 && caseMetas.length < 4_294_967_296) {
      discLowerRes = _lowerFlatU32(ctx);
    } else {
      throw new Error(`unsupported number of cases [${caseMetas.length}]`);
    }
    
    const payloadOffsetPtr = originalPtr + variantPayloadOffset32;
    ctx.storagePtr = payloadOffsetPtr;
    ctx.vals = [val];
    if (lowerFn) { lowerFn(ctx); }
    
    ctx.storagePtr = Math.max(ctx.storagePtr, originalPtr + variantSize32);
    
    const rem = ctx.storagePtr % variantAlign32;
    if (rem !== 0) { ctx.storagePtr += varianttAlign32 - rem; }
  }
}

function _lowerFlatList(meta) {
  const {
    elemLowerFn,
    knownLen,
    size32,
    align32,
    elemSize32,
    elemAlign32,
  } = meta;
  
  if (!elemLowerFn) { throw new TypeError("missing/invalid element lower fn for list"); }
  
  return function _lowerFlatListInner(ctx) {
    _debugLog('[_lowerFlatList()] args', { ctx });
    
    if (ctx.useDirectParams) {
      if (ctx.params.length < 2) { throw new Error('insufficient params left to lower list'); }
      const storagePtr = ctx.params[0];
      const elemCount = ctx.params[1];
      ctx.params = ctx.params.slice(2);
      
      const list = ctx.vals[0];
      if (!list) { throw new Error("missing direct param value"); }
      
      const lowerCtx = {
        storagePtr,
        memory: ctx.memory,
        stringEncoding: ctx.stringEncoding,
      };
      for (let idx = 0; idx < list.length; idx++) {
        const elemPtr = storagePtr + idx * elemSize32;
        lowerCtx.storagePtr = elemPtr;
        lowerCtx.vals = list.slice(idx, idx+1);
        elemLowerFn(lowerCtx);
        lowerCtx.storagePtr = Math.max(lowerCtx.storagePtr, elemPtr + elemSize32);
      }
      ctx.storagePtr = lowerCtx.storagePtr;
      
      // TODO: implement parma-only known-length processing
      
      return;
    }
    
    // TODO(fix): is it possible to get a vals that are a addr and length here from
    // a component lower?
    
    const elems = ctx.vals[0];
    if (knownLen === undefined) {
      // unknown length
      if (!ctx.realloc) { throw new Error('missing realloc during flat string lower'); }
      const dataPtr = ctx.realloc(0, 0, elemAlign32, elemSize32 * elems.length);
      
      ctx.vals[0] = dataPtr;
      _lowerFlatU32(ctx);
      
      ctx.vals[0] = elems.length;
      _lowerFlatU32(ctx);
      
      const origPtr = ctx.storagePtr;
      ctx.storagePtr = dataPtr;
      
      for (const [idx, elem] of elems.entries()) {
        const elemPtr = dataPtr + idx * elemSize32;
        ctx.storagePtr = elemPtr;
        ctx.vals = [elem];
        elemLowerFn(ctx);
        ctx.storagePtr = Math.max(ctx.storagePtr, elemPtr + elemSize32);
      }
      
      ctx.storagePtr = origPtr;
      
    } else {
      // known length
      
      if (elems.length !== knownLen) {
        throw new TypeError(`invalid list input of length [${elems.length}], must be length [${knownLen}]`);
      }
      
      const originalPtr = ctx.storagePtr;
      for (const [idx, elem] of elems.entries()) {
        const elemPtr = originalPtr + idx * elemSize32;
        ctx.storagePtr = elemPtr;
        ctx.vals = [elem];
        elemLowerFn(ctx);
        ctx.storagePtr = Math.max(ctx.storagePtr, elemPtr + elemSize32);
      }
    }
    
    // TODO(fix): special case for u8/u16/etc, we can do a direct copy
    
    const totalSizeBytes = elems.length * size32;
    if (ctx.storageLen !== undefined && totalSizeBytes > ctx.storageLen) {
      throw new Error('not enough storage remaining for list flat lower');
    }
  }
}

function _lowerFlatTuple(meta) {
  const { elemLowerMetas, size32: tupleSize32, align32: tupleAlign32 } = meta;
  return function _lowerFlatTupleInner(ctx) {
    _debugLog('[_lowerFlatTuple()] args', { ctx });
    const originalPtr = ctx.storagePtr;
    const tuple = ctx.vals[0];
    for (const [idx, [ lowerFn, size32, align32 ]]  of elemLowerMetas.entries()) {
      const rem = ctx.storagePtr % align32;
      if (rem !== 0) { ctx.storagePtr += align32 - rem; }
      
      const elemPtr = ctx.storagePtr;
      ctx.vals = [tuple[idx]];
      lowerFn(ctx);
      ctx.storagePtr = Math.max(ctx.storagePtr, elemPtr + size32);
    }
    
    ctx.storagePtr = Math.max(ctx.storagePtr, originalPtr + tupleSize32);
    
    const rem = ctx.storagePtr % tupleAlign32;
    if (rem !== 0) {
      ctx.storagePtr += tupleAlign32 - rem;
    }
  }
}

function _lowerFlatFlags(meta) {
  const { names, size32, align32, intSizeBytes } = meta;
  
  return function _lowerFlatFlagsInner(ctx) {
    _debugLog('[_lowerFlatFlags()] args', { ctx });
    if (ctx.vals.length !== 1) { throw new Error('unexpected number of vals'); }
    
    let flagObj = ctx.vals[0];
    let flagValue = 0;
    if (typeof flagObj === 'object' && flagObj !== null) {
      for (const [idx, name] of names.entries()) {
        if (flagObj[name] === true) {
          flagValue |= 1 << idx;
        }
      }
    } else if (flagObj !== null && flagObj !== undefined) {
      throw new TypeError('only an object, undefined or null can be converted to flags');
    }
    
    const rem = ctx.storagePtr % align32;
    if (rem !== 0) { ctx.storagePtr += (align32 - rem); }
    
    const dv = new DataView(ctx.memory.buffer);
    if (intSizeBytes === 1) {
      dv.setUint8(ctx.storagePtr, flagValue);
    } else if (intSizeBytes === 2) {
      dv.setUint16(ctx.storagePtr, flagValue);
    } else if (intSizeBytes === 4) {
      dv.setUint32(ctx.storagePtr, flagValue);
    } else {
      throw new Error(`unrecognized flag size [${intSizeBytes} bytes]`);
    }
    
    ctx.storagePtr += intSizeBytes;
  }
}

function _lowerFlatEnum(meta) {
  const f = _lowerFlatVariant(meta);
  return function _lowerFlatEnumInner(ctx) {
    _debugLog('[_lowerFlatEnum()] args', { ctx });
    
    const v = ctx.vals[0];
    const isNotEnumObject = typeof v !== 'object'
    || Object.keys(v).length !== 2
    || !('tag' in v);
    if (isNotEnumObject) {
      ctx.vals[0] = { tag: v };
    }
    
    f(ctx);
  }
}

function _lowerFlatOption(meta) {
  const f = _lowerFlatVariant(meta);
  return function _lowerFlatOptionInner(ctx) {
    _debugLog('[_lowerFlatOption()] args', { ctx });
    
    const v = ctx.vals[0];
    if (v === null) {
      ctx.vals[0] = { tag: 'none' };
    } else {
      const isNotOptionObject = typeof v !== 'object'
      || Object.keys(v).length !== 2
      || !('tag' in v)
      || !(v.tag === 'some' || v.tag === 'none')
      || !('val' in v);
      if (isNotOptionObject) {
        ctx.vals[0] = { tag: 'some', val: v };
      }
    }
    
    f(ctx);
  }
}

function _lowerFlatResult(meta) {
  const f = _lowerFlatVariant(meta);
  return function _lowerFlatResultInner(ctx) {
    _debugLog('[_lowerFlatResult()] args', { ctx });
    
    const v = ctx.vals[0];
    const isNotResultObject = typeof v !== 'object'
    || Object.keys(v).length !== 2
    || !('tag' in v)
    || !('ok' === v.tag || 'err' === v.tag)
    || !('val' in v);
    if (isNotResultObject) {
      ctx.vals[0] = { tag: 'ok', val: v };
    }
    
    f(ctx);
  };
}

function _lowerFlatOwn(meta) {
  const { lowerFn, componentIdx } = meta;
  
  return function _lowerFlatOwnInner(ctx) {
    _debugLog('[_lowerFlatOwn()] args', { ctx });
    const { createFn } = ctx;
    
    if (ctx.componentIdx !== componentIdx) {
      throw new Error(`component index mismatch (expected [${componentIdx}], lift called from [${ctx.componentIdx}])`);
    }
    
    const obj = ctx.vals[0];
    if (obj === undefined || obj === null) { throw new Error('missing resource'); }
    const handle = lowerFn(obj);
    
    ctx.vals[0] = handle;
    _lowerFlatU32(ctx);
  };
}

const STREAMS = new RepTable({ target: 'global stream map' });
const ASYNC_STATE = new Map();

function getOrCreateAsyncState(componentIdx, init) {
  if (!ASYNC_STATE.has(componentIdx)) {
    const newState = new ComponentAsyncState({ componentIdx });
    ASYNC_STATE.set(componentIdx, newState);
  }
  return ASYNC_STATE.get(componentIdx);
}

class ComponentAsyncState {
  static EVENT_HANDLER_EVENTS = [ 'backpressure-change' ];
  
  #componentIdx;
  #callingAsyncImport = false;
  #syncImportWait = promiseWithResolvers();
  #locked = false;
  #parkedTasks = new Map();
  #suspendedTasksByTaskID = new Map();
  #suspendedTaskIDs = [];
  #errored = null;
  
  #backpressure = 0;
  #backpressureWaiters = 0n;
  
  #handlerMap = new Map();
  #nextHandlerID = 0n;
  
  #tickLoop = null;
  #tickLoopInterval = null;
  
  #onExclusiveReleaseHandlers = [];
  
  mayLeave = true;
  
  handles;
  subtasks;
  
  constructor(args) {
    this.#componentIdx = args.componentIdx;
    this.handles = new RepTable({ target: `component [${this.#componentIdx}] handles (waitable objects)` });
    this.subtasks = new RepTable({ target: `component [${this.#componentIdx}] subtasks` });
  };
  
  componentIdx() { return this.#componentIdx; }
  
  errored() { return this.#errored !== null; }
  setErrored(err) {
    _debugLog('[ComponentAsyncState#setErrored()] component errored', { err, componentIdx: this.#componentIdx });
    if (this.#errored) { return; }
    if (!err) {
      err = new Error('error elswehere (see other component instance error)')
      err.componentIdx = this.#componentIdx;
    }
    this.#errored = err;
  }
  
  callingSyncImport(val) {
    if (val === undefined) { return this.#callingAsyncImport; }
    if (typeof val !== 'boolean') { throw new TypeError('invalid setting for async import'); }
    const prev = this.#callingAsyncImport;
    this.#callingAsyncImport = val;
    if (prev === true && this.#callingAsyncImport === false) {
      this.#notifySyncImportEnd();
    }
  }
  
  #notifySyncImportEnd() {
    const existing = this.#syncImportWait;
    this.#syncImportWait = promiseWithResolvers();
    existing.resolve();
  }
  
  async waitForSyncImportCallEnd() {
    await this.#syncImportWait.promise;
  }
  
  setBackpressure(v) {
    this.#backpressure = v;
    return this.#backpressure
  }
  getBackpressure() { return this.#backpressure; }
  
  incrementBackpressure() {
    const current = this.#backpressure;
    if (current < 0 || current > 2**16) {
      throw new Error(`invalid current backpressure value [${current}]`);
    }
    const newValue = this.getBackpressure() + 1;
    if (newValue >= 2**16) {
      throw new Error(`invalid new backpressure value [${newValue}], overflow`);
    }
    return this.setBackpressure(newValue);
  }
  
  decrementBackpressure() {
    const current = this.#backpressure;
    if (current < 0 || current > 2**16) {
      throw new Error(`invalid current backpressure value [${current}]`);
    }
    const newValue = Math.max(0, current - 1);
    if (newValue < 0) {
      throw new Error(`invalid new backpressure value [${newValue}], underflow`);
    }
    return this.setBackpressure(newValue);
  }
  hasBackpressure() { return this.#backpressure > 0; }
  
  waitForBackpressure() {
    let backpressureCleared = false;
    const cstate = this;
    cstate.addBackpressureWaiter();
    const handlerID = this.registerHandler({
      event: 'backpressure-change',
      fn: (bp) => {
        if (bp === 0) {
          cstate.removeHandler(handlerID);
          backpressureCleared = true;
        }
      }
    });
    return new Promise((resolve) => {
      const interval = setInterval(() => {
        if (backpressureCleared) { return; }
        clearInterval(interval);
        cstate.removeBackpressureWaiter();
        resolve(null);
      }, 0);
    });
  }
  
  registerHandler(args) {
    const { event, fn } = args;
    if (!event) { throw new Error("missing handler event"); }
    if (!fn) { throw new Error("missing handler fn"); }
    
    if (!ComponentAsyncState.EVENT_HANDLER_EVENTS.includes(event)) {
      throw new Error(`unrecognized event handler [${event}]`);
    }
    
    const handlerID = this.#nextHandlerID++;
    let handlers = this.#handlerMap.get(event);
    if (!handlers) {
      handlers = [];
      this.#handlerMap.set(event, handlers)
    }
    
    handlers.push({ id: handlerID, fn, event });
    return handlerID;
  }
  
  removeHandler(args) {
    const { event, handlerID } = args;
    const registeredHandlers = this.#handlerMap.get(event);
    if (!registeredHandlers) { return; }
    const found = registeredHandlers.find(h => h.id === handlerID);
    if (!found) { return; }
    this.#handlerMap.set(event, this.#handlerMap.get(event).filter(h => h.id !== handlerID));
  }
  
  getBackpressureWaiters() { return this.#backpressureWaiters; }
  addBackpressureWaiter() { this.#backpressureWaiters++; }
  removeBackpressureWaiter() {
    this.#backpressureWaiters--;
    if (this.#backpressureWaiters < 0) {
      throw new Error("unexepctedly negative number of backpressure waiters");
    }
  }
  
  isExclusivelyLocked() { return this.#locked === true; }
  setLocked(locked) {
    this.#locked = locked;
  }
  
  exclusiveLock() {
    _debugLog('[ComponentAsyncState#exclusiveLock()]', {
      locked: this.#locked,
      componentIdx: this.#componentIdx,
    });
    this.setLocked(true);
  }
  
  exclusiveRelease() {
    _debugLog('[ComponentAsyncState#exclusiveRelease()] args', {
      locked: this.#locked,
      componentIdx: this.#componentIdx,
    });
    this.setLocked(false);
    
    this.#onExclusiveReleaseHandlers = this.#onExclusiveReleaseHandlers.filter(v => !!v);
    for (const [idx, f] of this.#onExclusiveReleaseHandlers.entries()) {
      try {
        this.#onExclusiveReleaseHandlers[idx] = null;
        f();
      } catch (err) {
        _debugLog("error while executing handler for next exclusive release", err);
        throw err;
      }
    }
  }
  
  onNextExclusiveRelease(fn) {
    _debugLog('[ComponentAsyncState#()onNextExclusiveRelease] registering');
    this.#onExclusiveReleaseHandlers.push(fn);
  }
  
  // nextTaskPromise & nextTaskQueue are used to await current task completion and queues
  // any tasks attempting to enter() and complete.
  //
  // see: nextTaskExecutionSlot()
  //
  // TODO(threads): this should be unnecessary once threads are properly implemented,
  // as the task.enter() logic should suffice (it should be guaranteed that we cannot re-enter
  // unless the task in question is the current task in the thread execution, and only one can
  // run at a time)
  #nextTaskPromise = Promise.resolve(true);
  #nextTaskQueue = [];
  
  async nextTaskExecutionSlot(args) {
    const { task } = args;
    
    const placeholder = {
      completed: false,
      task,
      promise: task.exitPromise().then(() => {
        placeholder.completed = true;
      }),
    };
    this.#nextTaskQueue.push(placeholder);
    
    let next;
    while (true) {
      await this.#nextTaskPromise;
      
      next = this.#nextTaskQueue.find(placeholder => !placeholder.completed);
      
      // This task is next in the queue, we can continue
      if (next === undefined || next === placeholder) {
        this.#nextTaskPromise = next.promise;
        if (this.#nextTaskQueue.length > 1000) {
          this.#nextTaskQueue = this.#nextTaskQueue.filter(p => !p.completed);
          if (this.#nextTaskQueue.length > 1000) {
            _debugLog('[ComponentAsyncState#()nextTaskExecutionSlot] next task queue length > 1000 even after cleanup, tasks may be leaking');
          }
        }
        break;
      }
      
      // If we get here, this task was *not* next in the queue, continue waiting
      // (at this point the task that *is* next will likely have already set itself
      // as this.#nextTaskPromise)
    }
  }
  
  #getSuspendedTaskMeta(taskID) {
    return this.#suspendedTasksByTaskID.get(taskID);
  }
  
  #removeSuspendedTaskMeta(taskID) {
    _debugLog('[ComponentAsyncState#removeSuspendedTaskMeta()] removing suspended task', {
      taskID,
      componentIdx: this.#componentIdx,
    });
    const idx = this.#suspendedTaskIDs.findIndex(t => t === taskID);
    const meta = this.#suspendedTasksByTaskID.get(taskID);
    this.#suspendedTaskIDs[idx] = null;
    this.#suspendedTasksByTaskID.delete(taskID);
    return meta;
  }
  
  #addSuspendedTaskMeta(meta) {
    if (!meta) { throw new Error('missing task meta'); }
    const taskID = meta.taskID;
    this.#suspendedTasksByTaskID.set(taskID, meta);
    this.#suspendedTaskIDs.push(taskID);
    if (this.#suspendedTasksByTaskID.size < this.#suspendedTaskIDs.length - 10) {
      this.#suspendedTaskIDs = this.#suspendedTaskIDs.filter(t => t !== null);
    }
  }
  
  // TODO(threads): readyFn is normally on the thread
  suspendTask(args) {
    const { task, readyFn } = args;
    const taskID = task.id();
    const componentIdx = task.componentIdx();
    _debugLog('[ComponentAsyncState#suspendTask()]', {
      taskID,
      componentIdx: this.#componentIdx,
      taskEntryFnName: task.entryFnName(),
      subtask: task.getParentSubtask(),
    });
    
    if (componentIdx !== this.#componentIdx) {
      throw new Error('assert: task component idx should match async state');
    }
    
    if (this.#getSuspendedTaskMeta(taskID)) {
      throw new Error(`task [${taskID}] already suspended`);
    }
    
    const { promise, resolve, reject } = promiseWithResolvers();
    this.#addSuspendedTaskMeta({
      task,
      taskID,
      readyFn,
      resume: () => {
        _debugLog('[ComponentAsyncState] resuming suspended task', {
          taskID,
          componentIdx: this.#componentIdx,
        });
        // TODO(threads): it's thread cancellation we should be checking for below, not task
        resolve(!task.isCancelled());
      },
    });
    
    this.runTickLoop();
    
    return promise;
  }
  
  resumeTaskByID(taskID) {
    const meta = this.#removeSuspendedTaskMeta(taskID);
    if (!meta) { return; }
    if (meta.taskID !== taskID) { throw new Error('task ID does not match'); }
    meta.resume();
  }
  
  async runTickLoop() {
    if (this.#tickLoop !== null) { return; }
    this.#tickLoop = 1;
    setTimeout(async () => {
      let done = this.tick();
      while (!done) {
        await new Promise((resolve) => setTimeout(resolve, 30));
        done = this.tick();
      }
      this.#tickLoop = null;
    }, 10);
  }
  
  tick() {
    // _debugLog('[ComponentAsyncState#tick()]', { suspendedTaskIDs: this.#suspendedTaskIDs });
    
    const resumableTasks = this.#suspendedTaskIDs.filter(t => t !== null);
    for (const taskID of resumableTasks) {
      const meta = this.#suspendedTasksByTaskID.get(taskID);
      if (!meta || !meta.readyFn) {
        throw new Error(`missing/invalid task despite ID [${taskID}] being present`);
      }
      
      // If the task failed via any means, allow the task to resume because
      // it's been cancelled -- the callback should immediately exit as well
      if (meta.task.isRejected()) {
        _debugLog('[ComponentAsyncState#tick()] detected task rejection, leaving early', { meta });
        this.resumeTaskByID(taskID);
        return;
      }
      
      const isReady = meta.readyFn();
      if (!isReady) { continue; }
      
      _debugLog('[ComponentAsyncState#tick()] resuming task via tick', {
        taskID,
        componentIdx: this.#componentIdx,
      });
      this.resumeTaskByID(taskID);
    }
    
    return this.#suspendedTaskIDs.filter(t => t !== null).length === 0;
  }
  
  addStreamEndToTable(args) {
    _debugLog('[ComponentAsyncState#addStreamEnd()] args', args);
    const { tableIdx, streamEnd } = args;
    if (typeof streamEnd === 'number') { throw new Error("INSERTING BAD STREAMEND"); }
    
    let { table, componentIdx } = STREAM_TABLES[tableIdx];
    if (componentIdx === undefined || !table) {
      throw new Error(`invalid global stream table state for table [${tableIdx}]`);
    }
    
    const handle = table.insert(streamEnd);
    streamEnd.setHandle(handle);
    streamEnd.setStreamTableIdx(tableIdx);
    
    const cstate = getOrCreateAsyncState(componentIdx);
    const waitableIdx = cstate.handles.insert(streamEnd);
    streamEnd.setWaitableIdx(waitableIdx);
    
    _debugLog('[ComponentAsyncState#addStreamEnd()] added stream end', {
      tableIdx,
      table,
      handle,
      streamEnd,
      destComponentIdx: componentIdx,
    });
    
    return { handle, waitableIdx };
  }
  
  createWaitable(args) {
    return new Waitable({ target: args?.target, });
  }
  
  createReadableStreamEnd(args) {
    _debugLog('[ComponentAsyncState#createStreamEnd()] args', args);
    const { tableIdx, elemMeta, hostInjectFn } = args;
    
    const { table: localStreamTable, componentIdx } = STREAM_TABLES[tableIdx];
    if (!localStreamTable) {
      throw new Error(`missing global stream table lookup for table [${tableIdx}] while creating stream`);
    }
    if (componentIdx !== this.#componentIdx) {
      throw new Error('component idx mismatch while creating stream');
    }
    
    const waitable = this.createWaitable();
    const streamEnd = new StreamReadableEnd({
      tableIdx,
      elemMeta,
      hostInjectFn,
      pendingBufferMeta: {},
      target: `stream read end (lowered, @init)`,
      waitable,
    });
    
    streamEnd.setWaitableIdx(this.handles.insert(streamEnd));
    streamEnd.setHandle(localStreamTable.insert(streamEnd));
    if (streamEnd.streamTableIdx() !== tableIdx) {
      throw new Error("unexpectedly mismatched stream table");
    }
    const streamEndWaitableIdx = streamEnd.waitableIdx();
    const streamEndHandle = streamEnd.handle();
    waitable.setTarget(`waitable for stream read end (lowered, waitable [${streamEndWaitableIdx}])`);
    streamEnd.setTarget(`stream read end (lowered, waitable [${streamEndWaitableIdx}])`);
    
    return {
      waitableIdx: streamEndWaitableIdx,
      handle: streamEndHandle,
      streamEnd,
    };
  }
  
  createStream(args) {
    _debugLog('[ComponentAsyncState#createStream()] args', args);
    const { tableIdx, elemMeta, hostInjectFn } = args;
    if (tableIdx === undefined) { throw new Error("missing table idx while adding stream"); }
    if (elemMeta === undefined) { throw new Error("missing element metadata while adding stream"); }
    
    const { table: localStreamTable, componentIdx } = STREAM_TABLES[tableIdx];
    if (!localStreamTable) {
      throw new Error(`missing global stream table lookup for table [${tableIdx}] while creating stream`);
    }
    if (componentIdx !== this.#componentIdx) {
      throw new Error('component idx mismatch while creating stream');
    }
    
    const readWaitable = this.createWaitable();
    const writeWaitable = this.createWaitable();
    
    const stream = new InternalStream({
      tableIdx,
      elemMeta,
      readWaitable,
      writeWaitable,
      hostInjectFn,
    });
    stream.setGlobalStreamMapRep(STREAMS.insert(stream));
    
    const writeEnd = stream.writeEnd();
    writeEnd.setWaitableIdx(this.handles.insert(writeEnd));
    writeEnd.setHandle(localStreamTable.insert(writeEnd));
    if (writeEnd.streamTableIdx() !== tableIdx) { throw new Error("unexpectedly mismatched stream table"); }
    
    const writeEndWaitableIdx = writeEnd.waitableIdx();
    const writeEndHandle = writeEnd.handle();
    writeWaitable.setTarget(`waitable for stream write end (waitable [${writeEndWaitableIdx}])`);
    writeEnd.setTarget(`stream write end (waitable [${writeEndWaitableIdx}])`);
    
    const readEnd = stream.readEnd();
    readEnd.setWaitableIdx(this.handles.insert(readEnd));
    readEnd.setHandle(localStreamTable.insert(readEnd));
    if (readEnd.streamTableIdx() !== tableIdx) { throw new Error("unexpectedly mismatched stream table"); }
    
    const readEndWaitableIdx = readEnd.waitableIdx();
    const readEndHandle = readEnd.handle();
    readWaitable.setTarget(`waitable for read end (waitable [${readEndWaitableIdx}])`);
    readEnd.setTarget(`stream read end (waitable [${readEndWaitableIdx}])`);
    
    return {
      writeEnd,
      writeEndWaitableIdx,
      writeEndHandle,
      readEndWaitableIdx,
      readEndHandle,
      readEnd,
    };
  }
  
  getStreamEnd(args) {
    _debugLog('[ComponentAsyncState#getStreamEnd()] args', args);
    const { tableIdx, streamEndHandle, streamEndWaitableIdx } = args;
    if (tableIdx === undefined) {
      throw new Error('missing table idx while getting stream end');
    }
    
    const { table, componentIdx } = STREAM_TABLES[tableIdx];
    const cstate = getOrCreateAsyncState(componentIdx);
    
    let streamEnd;
    if (streamEndWaitableIdx !== undefined) {
      streamEnd = cstate.handles.get(streamEndWaitableIdx);
    } else if (streamEndHandle !== undefined) {
      if (!table) { throw new Error(`missing/invalid table [${tableIdx}] while getting stream end`); }
      streamEnd = table.get(streamEndHandle);
    } else {
      throw new TypeError("must specify either waitable idx or handle to retrieve stream");
    }
    
    if (!streamEnd) {
      throw new Error(`missing stream end (tableIdx [${tableIdx}], handle [${streamEndHandle}], waitableIdx [${streamEndWaitableIdx}])`);
    }
    if (tableIdx && streamEnd.streamTableIdx() !== tableIdx) {
      throw new Error(`stream end table idx [${streamEnd.streamTableIdx()}] does not match [${tableIdx}]`);
    }
    
    return streamEnd;
  }
  
  deleteStreamEnd(args) {
    _debugLog('[ComponentAsyncState#deleteStreamEnd()] args', args);
    const { tableIdx, streamEndWaitableIdx } = args;
    if (tableIdx === undefined) { throw new Error("missing table idx while removing stream end"); }
    if (streamEndWaitableIdx === undefined) { throw new Error("missing stream idx while removing stream end"); }
    
    const { table, componentIdx } = STREAM_TABLES[tableIdx];
    const cstate = getOrCreateAsyncState(componentIdx);
    
    const streamEnd = cstate.handles.get(streamEndWaitableIdx);
    if (!streamEnd) {
      throw new Error(`missing stream end [${streamEndWaitableIdx}] in component handles while deleting stream`);
    }
    if (streamEnd.streamTableIdx() !== tableIdx) {
      throw new Error(`stream end table idx [${streamEnd.streamTableIdx()}] does not match [${tableIdx}]`);
    }
    
    let removed = cstate.handles.remove(streamEnd.waitableIdx());
    if (!removed) {
      throw new Error(`failed to remove stream end [${streamEndWaitableIdx}] waitable obj in component [${componentIdx}]`);
    }
    
    removed = table.remove(streamEnd.handle());
    if (!removed) {
      throw new Error(`failed to remove stream end with handle [${streamEnd.handle()}] from stream table [${tableIdx}] in component [${componentIdx}]`);
    }
    
    return streamEnd;
  }
  
  removeStreamEndFromTable(args) {
    _debugLog('[ComponentAsyncState#removeStreamEndFromTable()] args', args);
    
    const { tableIdx, streamWaitableIdx } = args;
    if (tableIdx === undefined) { throw new Error("missing table idx while removing stream end"); }
    if (streamWaitableIdx === undefined) {
      throw new Error("missing stream end waitable idx while removing stream end");
    }
    
    const { table, componentIdx } = STREAM_TABLES[tableIdx];
    if (!table) { throw new Error(`missing/invalid table [${tableIdx}] while removing stream end`); }
    
    const cstate = getOrCreateAsyncState(componentIdx);
    
    const streamEnd = cstate.handles.get(streamWaitableIdx);
    if (!streamEnd) {
      throw new Error(`missing stream end (handle [${streamWaitableIdx}], table [${tableIdx}])`);
    }
    const handle = streamEnd.handle();
    
    let removed = cstate.handles.remove(streamWaitableIdx);
    if (!removed) {
      throw new Error(`failed to remove streamEnd from handles (waitable idx [${streamWaitableIdx}]), component [${componentIdx}])`);
    }
    
    removed = table.remove(handle);
    if (!removed) {
      throw new Error(`failed to remove streamEnd from table (handle [${handle}]), table [${tableIdx}], component [${componentIdx}])`);
    }
    
    return streamEnd;
  }
  
  createFuture(args) {
    _debugLog('[ComponentAsyncState#createFuture()] args', args);
    const { tableIdx, elemMeta, hostInjectFn } = args;
    if (tableIdx === undefined) { throw new Error("missing table idx while adding future"); }
    if (elemMeta === undefined) { throw new Error("missing element metadata while adding future"); }
    
    const { table: futureTable, componentIdx } = FUTURE_TABLES[tableIdx];
    if (!futureTable) {
      throw new Error(`missing global future table lookup for table [${tableIdx}] while creating future`);
    }
    if (componentIdx !== this.#componentIdx) {
      throw new Error('component idx mismatch while creating future');
    }
    
    const readWaitable = this.createWaitable();
    const writeWaitable = this.createWaitable();
    
    const future = new InternalFuture({
      tableIdx,
      componentIdx: this.#componentIdx,
      elemMeta,
      readWaitable,
      writeWaitable,
      hostInjectFn,
    });
    future.setGlobalFutureMapRep(FUTURES.insert(future));
    
    const writeEnd = future.writeEnd();
    writeEnd.setWaitableIdx(this.handles.insert(writeEnd));
    writeEnd.setHandle(futureTable.insert(writeEnd));
    if (writeEnd.futureTableIdx() !== tableIdx) { throw new Error("unexpectedly mismatched future table"); }
    
    const writeEndWaitableIdx = writeEnd.waitableIdx();
    const writeEndHandle = writeEnd.handle();
    writeWaitable.setTarget(`waitable for future write end (waitable [${writeEndWaitableIdx}])`);
    writeEnd.setTarget(`future write end (waitable [${writeEndWaitableIdx}])`);
    
    const readEnd = future.readEnd();
    readEnd.setWaitableIdx(this.handles.insert(readEnd));
    readEnd.setHandle(futureTable.insert(readEnd));
    if (readEnd.futureTableIdx() !== tableIdx) { throw new Error("unexpectedly mismatched future table"); }
    
    const readEndWaitableIdx = readEnd.waitableIdx();
    const readEndHandle = readEnd.handle();
    readWaitable.setTarget(`waitable for read end (waitable [${readEndWaitableIdx}])`);
    readEnd.setTarget(`future read end (waitable [${readEndWaitableIdx}])`);
    
    return {
      writeEnd,
      writeEndWaitableIdx,
      writeEndHandle,
      readEndWaitableIdx,
      readEndHandle,
      readEnd,
    };
  }
  
  getFutureEnd(args) {
    _debugLog('[ComponentAsyncState#getFutureEnd()] args', args);
    const { tableIdx, futureEndHandle, futureEndWaitableIdx } = args;
    if (tableIdx === undefined) {
      throw new Error('missing table idx while getting future end');
    }
    
    const { table, componentIdx } = FUTURE_TABLES[tableIdx];
    const cstate = getOrCreateAsyncState(componentIdx);
    
    let futureEnd;
    if (futureEndWaitableIdx !== undefined) {
      futureEnd = cstate.handles.get(futureEndWaitableIdx);
    } else if (futureEndHandle !== undefined) {
      if (!table) { throw new Error(`missing/invalid table [${tableIdx}] while getting future end`); }
      futureEnd = table.get(futureEndHandle);
    } else {
      throw new TypeError("must specify either waitable idx or handle to retrieve future");
    }
    
    if (!futureEnd) {
      throw new Error(`missing future end (tableIdx [${tableIdx}], handle [${futureEndHandle}], waitableIdx [${futureEndWaitableIdx}])`);
    }
    if (tableIdx && futureEnd.futureTableIdx() !== tableIdx) {
      throw new Error(`future end table idx [${futureEnd.futureTableIdx()}] does not match [${tableIdx}]`);
    }
    
    return futureEnd;
  }
  
  removeFutureEndFromTable(args) {
    _debugLog('[ComponentAsyncState#removeFutureEndFromTable()] args', args);
    
    const { tableIdx, futureWaitableIdx } = args;
    if (tableIdx === undefined) { throw new Error("missing table idx while removing future end"); }
    if (futureWaitableIdx === undefined) {
      throw new Error("missing future end waitable idx while removing future end");
    }
    
    const { table, componentIdx } = FUTURE_TABLES[tableIdx];
    if (!table) { throw new Error(`missing/invalid table [${tableIdx}] while removing future end`); }
    
    const cstate = getOrCreateAsyncState(componentIdx);
    
    const futureEnd = cstate.handles.get(futureWaitableIdx);
    if (!futureEnd) {
      throw new Error(`missing future end (handle [${futureWaitableIdx}], table [${tableIdx}])`);
    }
    const handle = futureEnd.handle();
    
    let removed = cstate.handles.remove(futureWaitableIdx);
    if (!removed) {
      throw new Error(`failed to remove futureEnd from handles (waitable idx [${futureWaitableIdx}]), component [${componentIdx}])`);
    }
    
    removed = table.remove(handle);
    if (!removed) {
      throw new Error(`failed to remove futureEnd from table (handle [${handle}]), table [${tableIdx}], component [${componentIdx}])`);
    }
    
    return futureEnd;
  }
  
}

function clampGuest(i, min, max) {
  if (i < min || i > max) {
    throw new TypeError(`must be between ${min} and ${max}`);
  }
  return i;
}


const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;
let _fs;
async function fetchCompile (url) {
  if (isNode) {
    _fs = _fs || await import('node:fs/promises');
    return WebAssembly.compile(await _fs.readFile(url));
  }
  return fetch(url).then(WebAssembly.compileStreaming);
}

const symbolCabiDispose = Symbol.for('cabiDispose');

const symbolRscHandle = Symbol('handle');

const symbolRscRep = Symbol.for('cabiRep');

const HANDLE_TABLES= [];


function finalizationRegistryCreate (unregister) {
  if (typeof FinalizationRegistry === 'undefined') {
    return { unregister () {} };
  }
  return new FinalizationRegistry(unregister);
}

class ComponentError extends Error {
  constructor (value) {
    const enumerable = typeof value !== 'string';
    super(enumerable ? `${String(value)} (see error.payload)` : value);
    Object.defineProperty(this, 'payload', { value, enumerable });
  }
}

function getErrorPayload(e) {
  if (e && hasOwnProperty.call(e, 'payload')) return e.payload;
  if (e instanceof Error) throw e;
  return e;
}

const isLE = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

function throwInvalidBool() {
  throw new TypeError('invalid variant discriminant for bool');
}

const hasOwnProperty = Object.prototype.hasOwnProperty;


if (!getCoreModule) getCoreModule = (name) => fetchCompile(new URL(`./${name}`, import.meta.url));
const module0 = getCoreModule('plugin.core.wasm');
const module1 = getCoreModule('plugin.core2.wasm');
const module2 = getCoreModule('plugin.core3.wasm');
const module3 = getCoreModule('plugin.core4.wasm');

const { DraftSessionHandle } = imports['canopy:graph/draft-session'];

if (DraftSessionHandle=== undefined) {
  const err = new Error("unexpectedly undefined instance import 'DraftSessionHandle', was 'DraftSessionHandle' available at instantiation?");
  console.error("ERROR:", err.toString());
  throw err;
}

const { getStderr } = imports['wasi:cli/stderr'];

if (getStderr=== undefined) {
  const err = new Error("unexpectedly undefined instance import 'getStderr', was 'getStderr' available at instantiation?");
  console.error("ERROR:", err.toString());
  throw err;
}

const { getStdin } = imports['wasi:cli/stdin'];

if (getStdin=== undefined) {
  const err = new Error("unexpectedly undefined instance import 'getStdin', was 'getStdin' available at instantiation?");
  console.error("ERROR:", err.toString());
  throw err;
}

const { getStdout } = imports['wasi:cli/stdout'];

if (getStdout=== undefined) {
  const err = new Error("unexpectedly undefined instance import 'getStdout', was 'getStdout' available at instantiation?");
  console.error("ERROR:", err.toString());
  throw err;
}

const { TerminalInput } = imports['wasi:cli/terminal-input'];

if (TerminalInput=== undefined) {
  const err = new Error("unexpectedly undefined instance import 'TerminalInput', was 'TerminalInput' available at instantiation?");
  console.error("ERROR:", err.toString());
  throw err;
}

const { TerminalOutput } = imports['wasi:cli/terminal-output'];

if (TerminalOutput=== undefined) {
  const err = new Error("unexpectedly undefined instance import 'TerminalOutput', was 'TerminalOutput' available at instantiation?");
  console.error("ERROR:", err.toString());
  throw err;
}

const { getTerminalStderr } = imports['wasi:cli/terminal-stderr'];

if (getTerminalStderr=== undefined) {
  const err = new Error("unexpectedly undefined instance import 'getTerminalStderr', was 'getTerminalStderr' available at instantiation?");
  console.error("ERROR:", err.toString());
  throw err;
}

const { getTerminalStdin } = imports['wasi:cli/terminal-stdin'];

if (getTerminalStdin=== undefined) {
  const err = new Error("unexpectedly undefined instance import 'getTerminalStdin', was 'getTerminalStdin' available at instantiation?");
  console.error("ERROR:", err.toString());
  throw err;
}

const { getTerminalStdout } = imports['wasi:cli/terminal-stdout'];

if (getTerminalStdout=== undefined) {
  const err = new Error("unexpectedly undefined instance import 'getTerminalStdout', was 'getTerminalStdout' available at instantiation?");
  console.error("ERROR:", err.toString());
  throw err;
}

const { now, subscribeDuration, subscribeInstant } = imports['wasi:clocks/monotonic-clock'];

if (now=== undefined) {
  const err = new Error("unexpectedly undefined instance import 'now', was 'now' available at instantiation?");
  console.error("ERROR:", err.toString());
  throw err;
}


if (subscribeDuration=== undefined) {
  const err = new Error("unexpectedly undefined instance import 'subscribeDuration', was 'subscribeDuration' available at instantiation?");
  console.error("ERROR:", err.toString());
  throw err;
}


if (subscribeInstant=== undefined) {
  const err = new Error("unexpectedly undefined instance import 'subscribeInstant', was 'subscribeInstant' available at instantiation?");
  console.error("ERROR:", err.toString());
  throw err;
}

const { now: now$1 } = imports['wasi:clocks/wall-clock'];

if (now$1=== undefined) {
  const err = new Error("unexpectedly undefined instance import 'now$1', was 'now' available at instantiation?");
  console.error("ERROR:", err.toString());
  throw err;
}

const { getDirectories } = imports['wasi:filesystem/preopens'];

if (getDirectories=== undefined) {
  const err = new Error("unexpectedly undefined instance import 'getDirectories', was 'getDirectories' available at instantiation?");
  console.error("ERROR:", err.toString());
  throw err;
}

const { Descriptor, filesystemErrorCode } = imports['wasi:filesystem/types'];

if (Descriptor=== undefined) {
  const err = new Error("unexpectedly undefined instance import 'Descriptor', was 'Descriptor' available at instantiation?");
  console.error("ERROR:", err.toString());
  throw err;
}


if (filesystemErrorCode=== undefined) {
  const err = new Error("unexpectedly undefined instance import 'filesystemErrorCode', was 'filesystemErrorCode' available at instantiation?");
  console.error("ERROR:", err.toString());
  throw err;
}

const { handle } = imports['wasi:http/outgoing-handler'];

if (handle=== undefined) {
  const err = new Error("unexpectedly undefined instance import 'handle', was 'handle' available at instantiation?");
  console.error("ERROR:", err.toString());
  throw err;
}

const { Fields, FutureIncomingResponse, IncomingBody, IncomingRequest, IncomingResponse, OutgoingBody, OutgoingRequest, OutgoingResponse, RequestOptions, ResponseOutparam } = imports['wasi:http/types'];

if (Fields=== undefined) {
  const err = new Error("unexpectedly undefined instance import 'Fields', was 'Fields' available at instantiation?");
  console.error("ERROR:", err.toString());
  throw err;
}


if (FutureIncomingResponse=== undefined) {
  const err = new Error("unexpectedly undefined instance import 'FutureIncomingResponse', was 'FutureIncomingResponse' available at instantiation?");
  console.error("ERROR:", err.toString());
  throw err;
}


if (IncomingBody=== undefined) {
  const err = new Error("unexpectedly undefined instance import 'IncomingBody', was 'IncomingBody' available at instantiation?");
  console.error("ERROR:", err.toString());
  throw err;
}


if (IncomingRequest=== undefined) {
  const err = new Error("unexpectedly undefined instance import 'IncomingRequest', was 'IncomingRequest' available at instantiation?");
  console.error("ERROR:", err.toString());
  throw err;
}


if (IncomingResponse=== undefined) {
  const err = new Error("unexpectedly undefined instance import 'IncomingResponse', was 'IncomingResponse' available at instantiation?");
  console.error("ERROR:", err.toString());
  throw err;
}


if (OutgoingBody=== undefined) {
  const err = new Error("unexpectedly undefined instance import 'OutgoingBody', was 'OutgoingBody' available at instantiation?");
  console.error("ERROR:", err.toString());
  throw err;
}


if (OutgoingRequest=== undefined) {
  const err = new Error("unexpectedly undefined instance import 'OutgoingRequest', was 'OutgoingRequest' available at instantiation?");
  console.error("ERROR:", err.toString());
  throw err;
}


if (OutgoingResponse=== undefined) {
  const err = new Error("unexpectedly undefined instance import 'OutgoingResponse', was 'OutgoingResponse' available at instantiation?");
  console.error("ERROR:", err.toString());
  throw err;
}


if (RequestOptions=== undefined) {
  const err = new Error("unexpectedly undefined instance import 'RequestOptions', was 'RequestOptions' available at instantiation?");
  console.error("ERROR:", err.toString());
  throw err;
}


if (ResponseOutparam=== undefined) {
  const err = new Error("unexpectedly undefined instance import 'ResponseOutparam', was 'ResponseOutparam' available at instantiation?");
  console.error("ERROR:", err.toString());
  throw err;
}

const { Error: Error$1 } = imports['wasi:io/error'];

if (Error$1=== undefined) {
  const err = new Error("unexpectedly undefined instance import 'Error$1', was 'Error' available at instantiation?");
  console.error("ERROR:", err.toString());
  throw err;
}

const { Pollable, poll } = imports['wasi:io/poll'];

if (Pollable=== undefined) {
  const err = new Error("unexpectedly undefined instance import 'Pollable', was 'Pollable' available at instantiation?");
  console.error("ERROR:", err.toString());
  throw err;
}


if (poll=== undefined) {
  const err = new Error("unexpectedly undefined instance import 'poll', was 'poll' available at instantiation?");
  console.error("ERROR:", err.toString());
  throw err;
}

const { InputStream, OutputStream } = imports['wasi:io/streams'];

if (InputStream=== undefined) {
  const err = new Error("unexpectedly undefined instance import 'InputStream', was 'InputStream' available at instantiation?");
  console.error("ERROR:", err.toString());
  throw err;
}


if (OutputStream=== undefined) {
  const err = new Error("unexpectedly undefined instance import 'OutputStream', was 'OutputStream' available at instantiation?");
  console.error("ERROR:", err.toString());
  throw err;
}

const { getRandomBytes, getRandomU64 } = imports['wasi:random/random'];

if (getRandomBytes=== undefined) {
  const err = new Error("unexpectedly undefined instance import 'getRandomBytes', was 'getRandomBytes' available at instantiation?");
  console.error("ERROR:", err.toString());
  throw err;
}


if (getRandomU64=== undefined) {
  const err = new Error("unexpectedly undefined instance import 'getRandomU64', was 'getRandomU64' available at instantiation?");
  console.error("ERROR:", err.toString());
  throw err;
}

let gen = (function* _initGenerator () {
  let exports0;
  
  const handleTable2 = [T_FLAG, 0];
  handleTable2._createdReps = new Set();
  
  
  const captureTable2= new Map();
  let captureCnt2= 0;
  
  HANDLE_TABLES[2] = handleTable2;
  
  const _trampoline3 = function(arg0) {
    var handle1 = arg0;
    
    var rep2 = handleTable2[(handle1 << 1) + 1] & ~T_FLAG;
    var rsc0 = captureTable2.get(rep2);
    if (!rsc0) {
      rsc0 = Object.create(Pollable.prototype);
      Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
      Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
    }
    
    curResourceBorrows.push(rsc0);
    _debugLog('[iface="wasi:io/poll@0.2.10", function="[method]pollable.block"] [Instruction::CallInterface] (sync, @ enter)');
    const hostProvided = true;
    
    let parentTask;
    let task;
    let subtask;
    
    const createTask = () => {
      const results = createNewCurrentTask({
        componentIdx: -1,
        isAsync: false,
        entryFnName: 'block',
        getCallbackFn: () => null,
        callbackFnName: null,
        errHandling: 'none',
        callingWasmExport: false,
      });
      task = results[0];
    };
    
    taskCreation: {
      parentTask = getCurrentTask(
      0,
      _getGlobalCurrentTaskMeta(0)?.taskID,
      )?.task;
      
      if (!parentTask) {
        createTask();
        break taskCreation;
      }
      
      createTask();
      
      if (hostProvided) {
        subtask = parentTask.getLatestSubtask();
        if (!subtask) {
          throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
        }
        task.setParentSubtask(subtask);
      }
    }
    
    const started = task.enterSync();
    
    let ret;
    
    try {
      _withGlobalCurrentTaskMeta({
        componentIdx: task.componentIdx(),
        taskID: task.id(),
        fn: () => rsc0.block(),
      })
      ;
    } catch (err) {
      
      _debugLog('[Instruction::CallInterface] error during sync call', {
        taskID: task.id(),
        subtaskID: task.getParentSubtask()?.id(),
        err,
      });
      task.setErrored(err);
      task.reject(err);
      task.exit();
      throw err;
      
    }
    
    for (const rsc of curResourceBorrows) {
      rsc[symbolRscHandle] = undefined;
    }
    curResourceBorrows = [];
    _debugLog('[iface="wasi:io/poll@0.2.10", function="[method]pollable.block"][Instruction::Return]', {
      funcName: '[method]pollable.block',
      paramCount: 0,
      async: false,
      postReturn: false
    });
    task.resolve([ret]);
    task.exit();
  }
  _trampoline3.fnName = 'wasi:io/poll@0.2.10#block';
  
  const handleTable3 = [T_FLAG, 0];
  handleTable3._createdReps = new Set();
  
  
  const captureTable3= new Map();
  let captureCnt3= 0;
  
  HANDLE_TABLES[3] = handleTable3;
  
  const _trampoline4 = function(arg0) {
    var handle1 = arg0;
    
    var rep2 = handleTable3[(handle1 << 1) + 1] & ~T_FLAG;
    var rsc0 = captureTable3.get(rep2);
    if (!rsc0) {
      rsc0 = Object.create(InputStream.prototype);
      Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
      Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
    }
    
    curResourceBorrows.push(rsc0);
    _debugLog('[iface="wasi:io/streams@0.2.10", function="[method]input-stream.subscribe"] [Instruction::CallInterface] (sync, @ enter)');
    const hostProvided = true;
    
    let parentTask;
    let task;
    let subtask;
    
    const createTask = () => {
      const results = createNewCurrentTask({
        componentIdx: -1,
        isAsync: false,
        entryFnName: 'subscribe',
        getCallbackFn: () => null,
        callbackFnName: null,
        errHandling: 'none',
        callingWasmExport: false,
      });
      task = results[0];
    };
    
    taskCreation: {
      parentTask = getCurrentTask(
      0,
      _getGlobalCurrentTaskMeta(0)?.taskID,
      )?.task;
      
      if (!parentTask) {
        createTask();
        break taskCreation;
      }
      
      createTask();
      
      if (hostProvided) {
        subtask = parentTask.getLatestSubtask();
        if (!subtask) {
          throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
        }
        task.setParentSubtask(subtask);
      }
    }
    
    const started = task.enterSync();
    
    let ret;
    
    try {
      ret = _withGlobalCurrentTaskMeta({
        componentIdx: task.componentIdx(),
        taskID: task.id(),
        fn: () => rsc0.subscribe(),
      })
      ;
    } catch (err) {
      
      _debugLog('[Instruction::CallInterface] error during sync call', {
        taskID: task.id(),
        subtaskID: task.getParentSubtask()?.id(),
        err,
      });
      task.setErrored(err);
      task.reject(err);
      task.exit();
      throw err;
      
    }
    
    for (const rsc of curResourceBorrows) {
      rsc[symbolRscHandle] = undefined;
    }
    curResourceBorrows = [];
    
    if (!(ret instanceof Pollable)) {
      throw new TypeError('Resource error: Not a valid \"Pollable\" resource.');
    }
    var handle3 = ret[symbolRscHandle];
    if (!handle3) {
      const rep = ret[symbolRscRep] || ++captureCnt2;
      captureTable2.set(rep, ret);
      handle3 = rscTableCreateOwn(handleTable2, rep);
    }
    
    _debugLog('[iface="wasi:io/streams@0.2.10", function="[method]input-stream.subscribe"][Instruction::Return]', {
      funcName: '[method]input-stream.subscribe',
      paramCount: 1,
      async: false,
      postReturn: false
    });
    task.resolve([handle3]);
    task.exit();
    return handle3;
  }
  _trampoline4.fnName = 'wasi:io/streams@0.2.10#subscribe';
  
  const handleTable4 = [T_FLAG, 0];
  handleTable4._createdReps = new Set();
  
  
  const captureTable4= new Map();
  let captureCnt4= 0;
  
  HANDLE_TABLES[4] = handleTable4;
  
  const _trampoline5 = function(arg0) {
    var handle1 = arg0;
    
    var rep2 = handleTable4[(handle1 << 1) + 1] & ~T_FLAG;
    var rsc0 = captureTable4.get(rep2);
    if (!rsc0) {
      rsc0 = Object.create(OutputStream.prototype);
      Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
      Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
    }
    
    curResourceBorrows.push(rsc0);
    _debugLog('[iface="wasi:io/streams@0.2.10", function="[method]output-stream.subscribe"] [Instruction::CallInterface] (sync, @ enter)');
    const hostProvided = true;
    
    let parentTask;
    let task;
    let subtask;
    
    const createTask = () => {
      const results = createNewCurrentTask({
        componentIdx: -1,
        isAsync: false,
        entryFnName: 'subscribe',
        getCallbackFn: () => null,
        callbackFnName: null,
        errHandling: 'none',
        callingWasmExport: false,
      });
      task = results[0];
    };
    
    taskCreation: {
      parentTask = getCurrentTask(
      0,
      _getGlobalCurrentTaskMeta(0)?.taskID,
      )?.task;
      
      if (!parentTask) {
        createTask();
        break taskCreation;
      }
      
      createTask();
      
      if (hostProvided) {
        subtask = parentTask.getLatestSubtask();
        if (!subtask) {
          throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
        }
        task.setParentSubtask(subtask);
      }
    }
    
    const started = task.enterSync();
    
    let ret;
    
    try {
      ret = _withGlobalCurrentTaskMeta({
        componentIdx: task.componentIdx(),
        taskID: task.id(),
        fn: () => rsc0.subscribe(),
      })
      ;
    } catch (err) {
      
      _debugLog('[Instruction::CallInterface] error during sync call', {
        taskID: task.id(),
        subtaskID: task.getParentSubtask()?.id(),
        err,
      });
      task.setErrored(err);
      task.reject(err);
      task.exit();
      throw err;
      
    }
    
    for (const rsc of curResourceBorrows) {
      rsc[symbolRscHandle] = undefined;
    }
    curResourceBorrows = [];
    
    if (!(ret instanceof Pollable)) {
      throw new TypeError('Resource error: Not a valid \"Pollable\" resource.');
    }
    var handle3 = ret[symbolRscHandle];
    if (!handle3) {
      const rep = ret[symbolRscRep] || ++captureCnt2;
      captureTable2.set(rep, ret);
      handle3 = rscTableCreateOwn(handleTable2, rep);
    }
    
    _debugLog('[iface="wasi:io/streams@0.2.10", function="[method]output-stream.subscribe"][Instruction::Return]', {
      funcName: '[method]output-stream.subscribe',
      paramCount: 1,
      async: false,
      postReturn: false
    });
    task.resolve([handle3]);
    task.exit();
    return handle3;
  }
  _trampoline5.fnName = 'wasi:io/streams@0.2.10#subscribe';
  
  const _trampoline6 = function() {
    _debugLog('[iface="wasi:clocks/monotonic-clock@0.2.10", function="now"] [Instruction::CallInterface] (sync, @ enter)');
    const hostProvided = true;
    
    let parentTask;
    let task;
    let subtask;
    
    const createTask = () => {
      const results = createNewCurrentTask({
        componentIdx: -1,
        isAsync: false,
        entryFnName: 'now',
        getCallbackFn: () => null,
        callbackFnName: null,
        errHandling: 'none',
        callingWasmExport: false,
      });
      task = results[0];
    };
    
    taskCreation: {
      parentTask = getCurrentTask(
      0,
      _getGlobalCurrentTaskMeta(0)?.taskID,
      )?.task;
      
      if (!parentTask) {
        createTask();
        break taskCreation;
      }
      
      createTask();
      
      if (hostProvided) {
        subtask = parentTask.getLatestSubtask();
        if (!subtask) {
          throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
        }
        task.setParentSubtask(subtask);
      }
    }
    
    const started = task.enterSync();
    
    let ret;
    
    try {
      ret = _withGlobalCurrentTaskMeta({
        componentIdx: task.componentIdx(),
        taskID: task.id(),
        fn: () => now(),
      })
      ;
    } catch (err) {
      
      _debugLog('[Instruction::CallInterface] error during sync call', {
        taskID: task.id(),
        subtaskID: task.getParentSubtask()?.id(),
        err,
      });
      task.setErrored(err);
      task.reject(err);
      task.exit();
      throw err;
      
    }
    
    _debugLog('[iface="wasi:clocks/monotonic-clock@0.2.10", function="now"][Instruction::Return]', {
      funcName: 'now',
      paramCount: 1,
      async: false,
      postReturn: false
    });
    task.resolve([toUint64(ret)]);
    task.exit();
    return toUint64(ret);
  }
  _trampoline6.fnName = 'wasi:clocks/monotonic-clock@0.2.10#now';
  
  const _trampoline7 = function(arg0) {
    _debugLog('[iface="wasi:clocks/monotonic-clock@0.2.10", function="subscribe-instant"] [Instruction::CallInterface] (sync, @ enter)');
    const hostProvided = true;
    
    let parentTask;
    let task;
    let subtask;
    
    const createTask = () => {
      const results = createNewCurrentTask({
        componentIdx: -1,
        isAsync: false,
        entryFnName: 'subscribeInstant',
        getCallbackFn: () => null,
        callbackFnName: null,
        errHandling: 'none',
        callingWasmExport: false,
      });
      task = results[0];
    };
    
    taskCreation: {
      parentTask = getCurrentTask(
      0,
      _getGlobalCurrentTaskMeta(0)?.taskID,
      )?.task;
      
      if (!parentTask) {
        createTask();
        break taskCreation;
      }
      
      createTask();
      
      if (hostProvided) {
        subtask = parentTask.getLatestSubtask();
        if (!subtask) {
          throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
        }
        task.setParentSubtask(subtask);
      }
    }
    
    const started = task.enterSync();
    
    let ret;
    
    try {
      ret = _withGlobalCurrentTaskMeta({
        componentIdx: task.componentIdx(),
        taskID: task.id(),
        fn: () => subscribeInstant(BigInt.asUintN(64, BigInt(arg0))),
      })
      ;
    } catch (err) {
      
      _debugLog('[Instruction::CallInterface] error during sync call', {
        taskID: task.id(),
        subtaskID: task.getParentSubtask()?.id(),
        err,
      });
      task.setErrored(err);
      task.reject(err);
      task.exit();
      throw err;
      
    }
    
    
    if (!(ret instanceof Pollable)) {
      throw new TypeError('Resource error: Not a valid \"Pollable\" resource.');
    }
    var handle0 = ret[symbolRscHandle];
    if (!handle0) {
      const rep = ret[symbolRscRep] || ++captureCnt2;
      captureTable2.set(rep, ret);
      handle0 = rscTableCreateOwn(handleTable2, rep);
    }
    
    _debugLog('[iface="wasi:clocks/monotonic-clock@0.2.10", function="subscribe-instant"][Instruction::Return]', {
      funcName: 'subscribe-instant',
      paramCount: 1,
      async: false,
      postReturn: false
    });
    task.resolve([handle0]);
    task.exit();
    return handle0;
  }
  _trampoline7.fnName = 'wasi:clocks/monotonic-clock@0.2.10#subscribeInstant';
  
  const _trampoline8 = function(arg0) {
    _debugLog('[iface="wasi:clocks/monotonic-clock@0.2.10", function="subscribe-duration"] [Instruction::CallInterface] (sync, @ enter)');
    const hostProvided = true;
    
    let parentTask;
    let task;
    let subtask;
    
    const createTask = () => {
      const results = createNewCurrentTask({
        componentIdx: -1,
        isAsync: false,
        entryFnName: 'subscribeDuration',
        getCallbackFn: () => null,
        callbackFnName: null,
        errHandling: 'none',
        callingWasmExport: false,
      });
      task = results[0];
    };
    
    taskCreation: {
      parentTask = getCurrentTask(
      0,
      _getGlobalCurrentTaskMeta(0)?.taskID,
      )?.task;
      
      if (!parentTask) {
        createTask();
        break taskCreation;
      }
      
      createTask();
      
      if (hostProvided) {
        subtask = parentTask.getLatestSubtask();
        if (!subtask) {
          throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
        }
        task.setParentSubtask(subtask);
      }
    }
    
    const started = task.enterSync();
    
    let ret;
    
    try {
      ret = _withGlobalCurrentTaskMeta({
        componentIdx: task.componentIdx(),
        taskID: task.id(),
        fn: () => subscribeDuration(BigInt.asUintN(64, BigInt(arg0))),
      })
      ;
    } catch (err) {
      
      _debugLog('[Instruction::CallInterface] error during sync call', {
        taskID: task.id(),
        subtaskID: task.getParentSubtask()?.id(),
        err,
      });
      task.setErrored(err);
      task.reject(err);
      task.exit();
      throw err;
      
    }
    
    
    if (!(ret instanceof Pollable)) {
      throw new TypeError('Resource error: Not a valid \"Pollable\" resource.');
    }
    var handle0 = ret[symbolRscHandle];
    if (!handle0) {
      const rep = ret[symbolRscRep] || ++captureCnt2;
      captureTable2.set(rep, ret);
      handle0 = rscTableCreateOwn(handleTable2, rep);
    }
    
    _debugLog('[iface="wasi:clocks/monotonic-clock@0.2.10", function="subscribe-duration"][Instruction::Return]', {
      funcName: 'subscribe-duration',
      paramCount: 1,
      async: false,
      postReturn: false
    });
    task.resolve([handle0]);
    task.exit();
    return handle0;
  }
  _trampoline8.fnName = 'wasi:clocks/monotonic-clock@0.2.10#subscribeDuration';
  
  const _trampoline9 = function() {
    _debugLog('[iface="wasi:random/random@0.2.10", function="get-random-u64"] [Instruction::CallInterface] (sync, @ enter)');
    const hostProvided = true;
    
    let parentTask;
    let task;
    let subtask;
    
    const createTask = () => {
      const results = createNewCurrentTask({
        componentIdx: -1,
        isAsync: false,
        entryFnName: 'getRandomU64',
        getCallbackFn: () => null,
        callbackFnName: null,
        errHandling: 'none',
        callingWasmExport: false,
      });
      task = results[0];
    };
    
    taskCreation: {
      parentTask = getCurrentTask(
      0,
      _getGlobalCurrentTaskMeta(0)?.taskID,
      )?.task;
      
      if (!parentTask) {
        createTask();
        break taskCreation;
      }
      
      createTask();
      
      if (hostProvided) {
        subtask = parentTask.getLatestSubtask();
        if (!subtask) {
          throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
        }
        task.setParentSubtask(subtask);
      }
    }
    
    const started = task.enterSync();
    
    let ret;
    
    try {
      ret = _withGlobalCurrentTaskMeta({
        componentIdx: task.componentIdx(),
        taskID: task.id(),
        fn: () => getRandomU64(),
      })
      ;
    } catch (err) {
      
      _debugLog('[Instruction::CallInterface] error during sync call', {
        taskID: task.id(),
        subtaskID: task.getParentSubtask()?.id(),
        err,
      });
      task.setErrored(err);
      task.reject(err);
      task.exit();
      throw err;
      
    }
    
    _debugLog('[iface="wasi:random/random@0.2.10", function="get-random-u64"][Instruction::Return]', {
      funcName: 'get-random-u64',
      paramCount: 1,
      async: false,
      postReturn: false
    });
    task.resolve([toUint64(ret)]);
    task.exit();
    return toUint64(ret);
  }
  _trampoline9.fnName = 'wasi:random/random@0.2.10#getRandomU64';
  
  const handleTable8 = [T_FLAG, 0];
  handleTable8._createdReps = new Set();
  
  
  const captureTable8= new Map();
  let captureCnt8= 0;
  
  HANDLE_TABLES[8] = handleTable8;
  
  const _trampoline10 = function() {
    _debugLog('[iface="wasi:http/types@0.2.10", function="[constructor]fields"] [Instruction::CallInterface] (sync, @ enter)');
    const hostProvided = true;
    
    let parentTask;
    let task;
    let subtask;
    
    const createTask = () => {
      const results = createNewCurrentTask({
        componentIdx: -1,
        isAsync: false,
        entryFnName: 'new Fields',
        getCallbackFn: () => null,
        callbackFnName: null,
        errHandling: 'none',
        callingWasmExport: false,
      });
      task = results[0];
    };
    
    taskCreation: {
      parentTask = getCurrentTask(
      0,
      _getGlobalCurrentTaskMeta(0)?.taskID,
      )?.task;
      
      if (!parentTask) {
        createTask();
        break taskCreation;
      }
      
      createTask();
      
      if (hostProvided) {
        subtask = parentTask.getLatestSubtask();
        if (!subtask) {
          throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
        }
        task.setParentSubtask(subtask);
      }
    }
    
    const started = task.enterSync();
    
    let ret;
    
    try {
      ret = _withGlobalCurrentTaskMeta({
        componentIdx: task.componentIdx(),
        taskID: task.id(),
        fn: () => new Fields(),
      })
      ;
    } catch (err) {
      
      _debugLog('[Instruction::CallInterface] error during sync call', {
        taskID: task.id(),
        subtaskID: task.getParentSubtask()?.id(),
        err,
      });
      task.setErrored(err);
      task.reject(err);
      task.exit();
      throw err;
      
    }
    
    
    if (!(ret instanceof Fields)) {
      throw new TypeError('Resource error: Not a valid \"Fields\" resource.');
    }
    var handle0 = ret[symbolRscHandle];
    if (!handle0) {
      const rep = ret[symbolRscRep] || ++captureCnt8;
      captureTable8.set(rep, ret);
      handle0 = rscTableCreateOwn(handleTable8, rep);
    }
    
    _debugLog('[iface="wasi:http/types@0.2.10", function="[constructor]fields"][Instruction::Return]', {
      funcName: '[constructor]fields',
      paramCount: 1,
      async: false,
      postReturn: false
    });
    task.resolve([handle0]);
    task.exit();
    return handle0;
  }
  _trampoline10.fnName = 'wasi:http/types@0.2.10#new Fields';
  
  const _trampoline11 = function(arg0) {
    var handle1 = arg0;
    
    var rep2 = handleTable8[(handle1 << 1) + 1] & ~T_FLAG;
    var rsc0 = captureTable8.get(rep2);
    if (!rsc0) {
      rsc0 = Object.create(Fields.prototype);
      Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
      Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
    }
    
    curResourceBorrows.push(rsc0);
    _debugLog('[iface="wasi:http/types@0.2.10", function="[method]fields.clone"] [Instruction::CallInterface] (sync, @ enter)');
    const hostProvided = true;
    
    let parentTask;
    let task;
    let subtask;
    
    const createTask = () => {
      const results = createNewCurrentTask({
        componentIdx: -1,
        isAsync: false,
        entryFnName: 'clone',
        getCallbackFn: () => null,
        callbackFnName: null,
        errHandling: 'none',
        callingWasmExport: false,
      });
      task = results[0];
    };
    
    taskCreation: {
      parentTask = getCurrentTask(
      0,
      _getGlobalCurrentTaskMeta(0)?.taskID,
      )?.task;
      
      if (!parentTask) {
        createTask();
        break taskCreation;
      }
      
      createTask();
      
      if (hostProvided) {
        subtask = parentTask.getLatestSubtask();
        if (!subtask) {
          throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
        }
        task.setParentSubtask(subtask);
      }
    }
    
    const started = task.enterSync();
    
    let ret;
    
    try {
      ret = _withGlobalCurrentTaskMeta({
        componentIdx: task.componentIdx(),
        taskID: task.id(),
        fn: () => rsc0.clone(),
      })
      ;
    } catch (err) {
      
      _debugLog('[Instruction::CallInterface] error during sync call', {
        taskID: task.id(),
        subtaskID: task.getParentSubtask()?.id(),
        err,
      });
      task.setErrored(err);
      task.reject(err);
      task.exit();
      throw err;
      
    }
    
    for (const rsc of curResourceBorrows) {
      rsc[symbolRscHandle] = undefined;
    }
    curResourceBorrows = [];
    
    if (!(ret instanceof Fields)) {
      throw new TypeError('Resource error: Not a valid \"Fields\" resource.');
    }
    var handle3 = ret[symbolRscHandle];
    if (!handle3) {
      const rep = ret[symbolRscRep] || ++captureCnt8;
      captureTable8.set(rep, ret);
      handle3 = rscTableCreateOwn(handleTable8, rep);
    }
    
    _debugLog('[iface="wasi:http/types@0.2.10", function="[method]fields.clone"][Instruction::Return]', {
      funcName: '[method]fields.clone',
      paramCount: 1,
      async: false,
      postReturn: false
    });
    task.resolve([handle3]);
    task.exit();
    return handle3;
  }
  _trampoline11.fnName = 'wasi:http/types@0.2.10#clone';
  
  const handleTable9 = [T_FLAG, 0];
  handleTable9._createdReps = new Set();
  
  
  const captureTable9= new Map();
  let captureCnt9= 0;
  
  HANDLE_TABLES[9] = handleTable9;
  
  const _trampoline12 = function(arg0) {
    var handle1 = arg0;
    
    var rep2 = handleTable9[(handle1 << 1) + 1] & ~T_FLAG;
    var rsc0 = captureTable9.get(rep2);
    if (!rsc0) {
      rsc0 = Object.create(IncomingRequest.prototype);
      Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
      Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
    }
    
    curResourceBorrows.push(rsc0);
    _debugLog('[iface="wasi:http/types@0.2.10", function="[method]incoming-request.headers"] [Instruction::CallInterface] (sync, @ enter)');
    const hostProvided = true;
    
    let parentTask;
    let task;
    let subtask;
    
    const createTask = () => {
      const results = createNewCurrentTask({
        componentIdx: -1,
        isAsync: false,
        entryFnName: 'headers',
        getCallbackFn: () => null,
        callbackFnName: null,
        errHandling: 'none',
        callingWasmExport: false,
      });
      task = results[0];
    };
    
    taskCreation: {
      parentTask = getCurrentTask(
      0,
      _getGlobalCurrentTaskMeta(0)?.taskID,
      )?.task;
      
      if (!parentTask) {
        createTask();
        break taskCreation;
      }
      
      createTask();
      
      if (hostProvided) {
        subtask = parentTask.getLatestSubtask();
        if (!subtask) {
          throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
        }
        task.setParentSubtask(subtask);
      }
    }
    
    const started = task.enterSync();
    
    let ret;
    
    try {
      ret = _withGlobalCurrentTaskMeta({
        componentIdx: task.componentIdx(),
        taskID: task.id(),
        fn: () => rsc0.headers(),
      })
      ;
    } catch (err) {
      
      _debugLog('[Instruction::CallInterface] error during sync call', {
        taskID: task.id(),
        subtaskID: task.getParentSubtask()?.id(),
        err,
      });
      task.setErrored(err);
      task.reject(err);
      task.exit();
      throw err;
      
    }
    
    for (const rsc of curResourceBorrows) {
      rsc[symbolRscHandle] = undefined;
    }
    curResourceBorrows = [];
    
    if (!(ret instanceof Fields)) {
      throw new TypeError('Resource error: Not a valid \"Headers\" resource.');
    }
    var handle3 = ret[symbolRscHandle];
    if (!handle3) {
      const rep = ret[symbolRscRep] || ++captureCnt8;
      captureTable8.set(rep, ret);
      handle3 = rscTableCreateOwn(handleTable8, rep);
    }
    
    _debugLog('[iface="wasi:http/types@0.2.10", function="[method]incoming-request.headers"][Instruction::Return]', {
      funcName: '[method]incoming-request.headers',
      paramCount: 1,
      async: false,
      postReturn: false
    });
    task.resolve([handle3]);
    task.exit();
    return handle3;
  }
  _trampoline12.fnName = 'wasi:http/types@0.2.10#headers';
  
  const handleTable11 = [T_FLAG, 0];
  handleTable11._createdReps = new Set();
  
  
  const captureTable11= new Map();
  let captureCnt11= 0;
  
  HANDLE_TABLES[11] = handleTable11;
  
  const _trampoline13 = function(arg0) {
    var handle1 = arg0;
    
    var rep2 = handleTable8[(handle1 << 1) + 1] & ~T_FLAG;
    var rsc0 = captureTable8.get(rep2);
    if (!rsc0) {
      rsc0 = Object.create(Fields.prototype);
      Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
      Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
    }
    
    else {
      captureTable8.delete(rep2);
    }
    rscTableRemove(handleTable8, handle1);
    _debugLog('[iface="wasi:http/types@0.2.10", function="[constructor]outgoing-request"] [Instruction::CallInterface] (sync, @ enter)');
    const hostProvided = true;
    
    let parentTask;
    let task;
    let subtask;
    
    const createTask = () => {
      const results = createNewCurrentTask({
        componentIdx: -1,
        isAsync: false,
        entryFnName: 'new OutgoingRequest',
        getCallbackFn: () => null,
        callbackFnName: null,
        errHandling: 'none',
        callingWasmExport: false,
      });
      task = results[0];
    };
    
    taskCreation: {
      parentTask = getCurrentTask(
      0,
      _getGlobalCurrentTaskMeta(0)?.taskID,
      )?.task;
      
      if (!parentTask) {
        createTask();
        break taskCreation;
      }
      
      createTask();
      
      if (hostProvided) {
        subtask = parentTask.getLatestSubtask();
        if (!subtask) {
          throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
        }
        task.setParentSubtask(subtask);
      }
    }
    
    const started = task.enterSync();
    
    let ret;
    
    try {
      ret = _withGlobalCurrentTaskMeta({
        componentIdx: task.componentIdx(),
        taskID: task.id(),
        fn: () => new OutgoingRequest(rsc0),
      })
      ;
    } catch (err) {
      
      _debugLog('[Instruction::CallInterface] error during sync call', {
        taskID: task.id(),
        subtaskID: task.getParentSubtask()?.id(),
        err,
      });
      task.setErrored(err);
      task.reject(err);
      task.exit();
      throw err;
      
    }
    
    
    if (!(ret instanceof OutgoingRequest)) {
      throw new TypeError('Resource error: Not a valid \"OutgoingRequest\" resource.');
    }
    var handle3 = ret[symbolRscHandle];
    if (!handle3) {
      const rep = ret[symbolRscRep] || ++captureCnt11;
      captureTable11.set(rep, ret);
      handle3 = rscTableCreateOwn(handleTable11, rep);
    }
    
    _debugLog('[iface="wasi:http/types@0.2.10", function="[constructor]outgoing-request"][Instruction::Return]', {
      funcName: '[constructor]outgoing-request',
      paramCount: 1,
      async: false,
      postReturn: false
    });
    task.resolve([handle3]);
    task.exit();
    return handle3;
  }
  _trampoline13.fnName = 'wasi:http/types@0.2.10#new OutgoingRequest';
  
  const _trampoline14 = function(arg0) {
    var handle1 = arg0;
    
    var rep2 = handleTable11[(handle1 << 1) + 1] & ~T_FLAG;
    var rsc0 = captureTable11.get(rep2);
    if (!rsc0) {
      rsc0 = Object.create(OutgoingRequest.prototype);
      Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
      Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
    }
    
    curResourceBorrows.push(rsc0);
    _debugLog('[iface="wasi:http/types@0.2.10", function="[method]outgoing-request.headers"] [Instruction::CallInterface] (sync, @ enter)');
    const hostProvided = true;
    
    let parentTask;
    let task;
    let subtask;
    
    const createTask = () => {
      const results = createNewCurrentTask({
        componentIdx: -1,
        isAsync: false,
        entryFnName: 'headers',
        getCallbackFn: () => null,
        callbackFnName: null,
        errHandling: 'none',
        callingWasmExport: false,
      });
      task = results[0];
    };
    
    taskCreation: {
      parentTask = getCurrentTask(
      0,
      _getGlobalCurrentTaskMeta(0)?.taskID,
      )?.task;
      
      if (!parentTask) {
        createTask();
        break taskCreation;
      }
      
      createTask();
      
      if (hostProvided) {
        subtask = parentTask.getLatestSubtask();
        if (!subtask) {
          throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
        }
        task.setParentSubtask(subtask);
      }
    }
    
    const started = task.enterSync();
    
    let ret;
    
    try {
      ret = _withGlobalCurrentTaskMeta({
        componentIdx: task.componentIdx(),
        taskID: task.id(),
        fn: () => rsc0.headers(),
      })
      ;
    } catch (err) {
      
      _debugLog('[Instruction::CallInterface] error during sync call', {
        taskID: task.id(),
        subtaskID: task.getParentSubtask()?.id(),
        err,
      });
      task.setErrored(err);
      task.reject(err);
      task.exit();
      throw err;
      
    }
    
    for (const rsc of curResourceBorrows) {
      rsc[symbolRscHandle] = undefined;
    }
    curResourceBorrows = [];
    
    if (!(ret instanceof Fields)) {
      throw new TypeError('Resource error: Not a valid \"Headers\" resource.');
    }
    var handle3 = ret[symbolRscHandle];
    if (!handle3) {
      const rep = ret[symbolRscRep] || ++captureCnt8;
      captureTable8.set(rep, ret);
      handle3 = rscTableCreateOwn(handleTable8, rep);
    }
    
    _debugLog('[iface="wasi:http/types@0.2.10", function="[method]outgoing-request.headers"][Instruction::Return]', {
      funcName: '[method]outgoing-request.headers',
      paramCount: 1,
      async: false,
      postReturn: false
    });
    task.resolve([handle3]);
    task.exit();
    return handle3;
  }
  _trampoline14.fnName = 'wasi:http/types@0.2.10#headers';
  
  const handleTable15 = [T_FLAG, 0];
  handleTable15._createdReps = new Set();
  
  
  const captureTable15= new Map();
  let captureCnt15= 0;
  
  HANDLE_TABLES[15] = handleTable15;
  
  const _trampoline15 = function(arg0) {
    var handle1 = arg0;
    
    var rep2 = handleTable15[(handle1 << 1) + 1] & ~T_FLAG;
    var rsc0 = captureTable15.get(rep2);
    if (!rsc0) {
      rsc0 = Object.create(IncomingResponse.prototype);
      Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
      Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
    }
    
    curResourceBorrows.push(rsc0);
    _debugLog('[iface="wasi:http/types@0.2.10", function="[method]incoming-response.status"] [Instruction::CallInterface] (sync, @ enter)');
    const hostProvided = true;
    
    let parentTask;
    let task;
    let subtask;
    
    const createTask = () => {
      const results = createNewCurrentTask({
        componentIdx: -1,
        isAsync: false,
        entryFnName: 'status',
        getCallbackFn: () => null,
        callbackFnName: null,
        errHandling: 'none',
        callingWasmExport: false,
      });
      task = results[0];
    };
    
    taskCreation: {
      parentTask = getCurrentTask(
      0,
      _getGlobalCurrentTaskMeta(0)?.taskID,
      )?.task;
      
      if (!parentTask) {
        createTask();
        break taskCreation;
      }
      
      createTask();
      
      if (hostProvided) {
        subtask = parentTask.getLatestSubtask();
        if (!subtask) {
          throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
        }
        task.setParentSubtask(subtask);
      }
    }
    
    const started = task.enterSync();
    
    let ret;
    
    try {
      ret = _withGlobalCurrentTaskMeta({
        componentIdx: task.componentIdx(),
        taskID: task.id(),
        fn: () => rsc0.status(),
      })
      ;
    } catch (err) {
      
      _debugLog('[Instruction::CallInterface] error during sync call', {
        taskID: task.id(),
        subtaskID: task.getParentSubtask()?.id(),
        err,
      });
      task.setErrored(err);
      task.reject(err);
      task.exit();
      throw err;
      
    }
    
    for (const rsc of curResourceBorrows) {
      rsc[symbolRscHandle] = undefined;
    }
    curResourceBorrows = [];
    _debugLog('[iface="wasi:http/types@0.2.10", function="[method]incoming-response.status"][Instruction::Return]', {
      funcName: '[method]incoming-response.status',
      paramCount: 1,
      async: false,
      postReturn: false
    });
    task.resolve([toUint16(ret)]);
    task.exit();
    return toUint16(ret);
  }
  _trampoline15.fnName = 'wasi:http/types@0.2.10#status';
  
  const _trampoline16 = function(arg0) {
    var handle1 = arg0;
    
    var rep2 = handleTable15[(handle1 << 1) + 1] & ~T_FLAG;
    var rsc0 = captureTable15.get(rep2);
    if (!rsc0) {
      rsc0 = Object.create(IncomingResponse.prototype);
      Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
      Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
    }
    
    curResourceBorrows.push(rsc0);
    _debugLog('[iface="wasi:http/types@0.2.10", function="[method]incoming-response.headers"] [Instruction::CallInterface] (sync, @ enter)');
    const hostProvided = true;
    
    let parentTask;
    let task;
    let subtask;
    
    const createTask = () => {
      const results = createNewCurrentTask({
        componentIdx: -1,
        isAsync: false,
        entryFnName: 'headers',
        getCallbackFn: () => null,
        callbackFnName: null,
        errHandling: 'none',
        callingWasmExport: false,
      });
      task = results[0];
    };
    
    taskCreation: {
      parentTask = getCurrentTask(
      0,
      _getGlobalCurrentTaskMeta(0)?.taskID,
      )?.task;
      
      if (!parentTask) {
        createTask();
        break taskCreation;
      }
      
      createTask();
      
      if (hostProvided) {
        subtask = parentTask.getLatestSubtask();
        if (!subtask) {
          throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
        }
        task.setParentSubtask(subtask);
      }
    }
    
    const started = task.enterSync();
    
    let ret;
    
    try {
      ret = _withGlobalCurrentTaskMeta({
        componentIdx: task.componentIdx(),
        taskID: task.id(),
        fn: () => rsc0.headers(),
      })
      ;
    } catch (err) {
      
      _debugLog('[Instruction::CallInterface] error during sync call', {
        taskID: task.id(),
        subtaskID: task.getParentSubtask()?.id(),
        err,
      });
      task.setErrored(err);
      task.reject(err);
      task.exit();
      throw err;
      
    }
    
    for (const rsc of curResourceBorrows) {
      rsc[symbolRscHandle] = undefined;
    }
    curResourceBorrows = [];
    
    if (!(ret instanceof Fields)) {
      throw new TypeError('Resource error: Not a valid \"Headers\" resource.');
    }
    var handle3 = ret[symbolRscHandle];
    if (!handle3) {
      const rep = ret[symbolRscRep] || ++captureCnt8;
      captureTable8.set(rep, ret);
      handle3 = rscTableCreateOwn(handleTable8, rep);
    }
    
    _debugLog('[iface="wasi:http/types@0.2.10", function="[method]incoming-response.headers"][Instruction::Return]', {
      funcName: '[method]incoming-response.headers',
      paramCount: 1,
      async: false,
      postReturn: false
    });
    task.resolve([handle3]);
    task.exit();
    return handle3;
  }
  _trampoline16.fnName = 'wasi:http/types@0.2.10#headers';
  
  const handleTable14 = [T_FLAG, 0];
  handleTable14._createdReps = new Set();
  
  
  const captureTable14= new Map();
  let captureCnt14= 0;
  
  HANDLE_TABLES[14] = handleTable14;
  
  const _trampoline17 = function(arg0) {
    var handle1 = arg0;
    
    var rep2 = handleTable8[(handle1 << 1) + 1] & ~T_FLAG;
    var rsc0 = captureTable8.get(rep2);
    if (!rsc0) {
      rsc0 = Object.create(Fields.prototype);
      Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
      Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
    }
    
    else {
      captureTable8.delete(rep2);
    }
    rscTableRemove(handleTable8, handle1);
    _debugLog('[iface="wasi:http/types@0.2.10", function="[constructor]outgoing-response"] [Instruction::CallInterface] (sync, @ enter)');
    const hostProvided = true;
    
    let parentTask;
    let task;
    let subtask;
    
    const createTask = () => {
      const results = createNewCurrentTask({
        componentIdx: -1,
        isAsync: false,
        entryFnName: 'new OutgoingResponse',
        getCallbackFn: () => null,
        callbackFnName: null,
        errHandling: 'none',
        callingWasmExport: false,
      });
      task = results[0];
    };
    
    taskCreation: {
      parentTask = getCurrentTask(
      0,
      _getGlobalCurrentTaskMeta(0)?.taskID,
      )?.task;
      
      if (!parentTask) {
        createTask();
        break taskCreation;
      }
      
      createTask();
      
      if (hostProvided) {
        subtask = parentTask.getLatestSubtask();
        if (!subtask) {
          throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
        }
        task.setParentSubtask(subtask);
      }
    }
    
    const started = task.enterSync();
    
    let ret;
    
    try {
      ret = _withGlobalCurrentTaskMeta({
        componentIdx: task.componentIdx(),
        taskID: task.id(),
        fn: () => new OutgoingResponse(rsc0),
      })
      ;
    } catch (err) {
      
      _debugLog('[Instruction::CallInterface] error during sync call', {
        taskID: task.id(),
        subtaskID: task.getParentSubtask()?.id(),
        err,
      });
      task.setErrored(err);
      task.reject(err);
      task.exit();
      throw err;
      
    }
    
    
    if (!(ret instanceof OutgoingResponse)) {
      throw new TypeError('Resource error: Not a valid \"OutgoingResponse\" resource.');
    }
    var handle3 = ret[symbolRscHandle];
    if (!handle3) {
      const rep = ret[symbolRscRep] || ++captureCnt14;
      captureTable14.set(rep, ret);
      handle3 = rscTableCreateOwn(handleTable14, rep);
    }
    
    _debugLog('[iface="wasi:http/types@0.2.10", function="[constructor]outgoing-response"][Instruction::Return]', {
      funcName: '[constructor]outgoing-response',
      paramCount: 1,
      async: false,
      postReturn: false
    });
    task.resolve([handle3]);
    task.exit();
    return handle3;
  }
  _trampoline17.fnName = 'wasi:http/types@0.2.10#new OutgoingResponse';
  
  const _trampoline18 = function(arg0, arg1) {
    var handle1 = arg0;
    
    var rep2 = handleTable14[(handle1 << 1) + 1] & ~T_FLAG;
    var rsc0 = captureTable14.get(rep2);
    if (!rsc0) {
      rsc0 = Object.create(OutgoingResponse.prototype);
      Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
      Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
    }
    
    curResourceBorrows.push(rsc0);
    _debugLog('[iface="wasi:http/types@0.2.10", function="[method]outgoing-response.set-status-code"] [Instruction::CallInterface] (sync, @ enter)');
    const hostProvided = true;
    
    let parentTask;
    let task;
    let subtask;
    
    const createTask = () => {
      const results = createNewCurrentTask({
        componentIdx: -1,
        isAsync: false,
        entryFnName: 'setStatusCode',
        getCallbackFn: () => null,
        callbackFnName: null,
        errHandling: 'result-catch-handler',
        callingWasmExport: false,
      });
      task = results[0];
    };
    
    taskCreation: {
      parentTask = getCurrentTask(
      0,
      _getGlobalCurrentTaskMeta(0)?.taskID,
      )?.task;
      
      if (!parentTask) {
        createTask();
        break taskCreation;
      }
      
      createTask();
      
      if (hostProvided) {
        subtask = parentTask.getLatestSubtask();
        if (!subtask) {
          throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
        }
        task.setParentSubtask(subtask);
      }
    }
    
    const started = task.enterSync();
    
    let ret;
    try {
      ret = { tag: 'ok', val: _withGlobalCurrentTaskMeta({
        componentIdx: task.componentIdx(),
        taskID: task.id(),
        fn: () => rsc0.setStatusCode(clampGuest(arg1, 0, 65535)),
      })
    };
  } catch (e) {
    ret = { tag: 'err', val: getErrorPayload(e) };
  }
  
  for (const rsc of curResourceBorrows) {
    rsc[symbolRscHandle] = undefined;
  }
  curResourceBorrows = [];
  var variant3 = ret;
  let variant3_0;
  switch (variant3.tag) {
    case 'ok': {
      const e = variant3.val;
      variant3_0 = 0;
      
      break;
    }
    case 'err': {
      const e = variant3.val;
      variant3_0 = 1;
      
      break;
    }
    default: {
      _debugLog("ERROR: invalid value (expected result as object with 'tag' member)", { value: variant3, valueType: typeof variant3});
      throw new TypeError('invalid variant specified for result');
    }
  }
  _debugLog('[iface="wasi:http/types@0.2.10", function="[method]outgoing-response.set-status-code"][Instruction::Return]', {
    funcName: '[method]outgoing-response.set-status-code',
    paramCount: 1,
    async: false,
    postReturn: false
  });
  task.resolve([variant3_0]);
  task.exit();
  return variant3_0;
}
_trampoline18.fnName = 'wasi:http/types@0.2.10#setStatusCode';

const _trampoline19 = function(arg0) {
  var handle1 = arg0;
  
  var rep2 = handleTable14[(handle1 << 1) + 1] & ~T_FLAG;
  var rsc0 = captureTable14.get(rep2);
  if (!rsc0) {
    rsc0 = Object.create(OutgoingResponse.prototype);
    Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
    Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
  }
  
  curResourceBorrows.push(rsc0);
  _debugLog('[iface="wasi:http/types@0.2.10", function="[method]outgoing-response.headers"] [Instruction::CallInterface] (sync, @ enter)');
  const hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1,
      isAsync: false,
      entryFnName: 'headers',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(
    0,
    _getGlobalCurrentTaskMeta(0)?.taskID,
    )?.task;
    
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  
  let ret;
  
  try {
    ret = _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => rsc0.headers(),
    })
    ;
  } catch (err) {
    
    _debugLog('[Instruction::CallInterface] error during sync call', {
      taskID: task.id(),
      subtaskID: task.getParentSubtask()?.id(),
      err,
    });
    task.setErrored(err);
    task.reject(err);
    task.exit();
    throw err;
    
  }
  
  for (const rsc of curResourceBorrows) {
    rsc[symbolRscHandle] = undefined;
  }
  curResourceBorrows = [];
  
  if (!(ret instanceof Fields)) {
    throw new TypeError('Resource error: Not a valid \"Headers\" resource.');
  }
  var handle3 = ret[symbolRscHandle];
  if (!handle3) {
    const rep = ret[symbolRscRep] || ++captureCnt8;
    captureTable8.set(rep, ret);
    handle3 = rscTableCreateOwn(handleTable8, rep);
  }
  
  _debugLog('[iface="wasi:http/types@0.2.10", function="[method]outgoing-response.headers"][Instruction::Return]', {
    funcName: '[method]outgoing-response.headers',
    paramCount: 1,
    async: false,
    postReturn: false
  });
  task.resolve([handle3]);
  task.exit();
  return handle3;
}
_trampoline19.fnName = 'wasi:http/types@0.2.10#headers';

const handleTable16 = [T_FLAG, 0];
handleTable16._createdReps = new Set();


const captureTable16= new Map();
let captureCnt16= 0;

HANDLE_TABLES[16] = handleTable16;

const _trampoline20 = function(arg0) {
  var handle1 = arg0;
  
  var rep2 = handleTable16[(handle1 << 1) + 1] & ~T_FLAG;
  var rsc0 = captureTable16.get(rep2);
  if (!rsc0) {
    rsc0 = Object.create(FutureIncomingResponse.prototype);
    Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
    Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
  }
  
  curResourceBorrows.push(rsc0);
  _debugLog('[iface="wasi:http/types@0.2.10", function="[method]future-incoming-response.subscribe"] [Instruction::CallInterface] (sync, @ enter)');
  const hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1,
      isAsync: false,
      entryFnName: 'subscribe',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(
    0,
    _getGlobalCurrentTaskMeta(0)?.taskID,
    )?.task;
    
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  
  let ret;
  
  try {
    ret = _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => rsc0.subscribe(),
    })
    ;
  } catch (err) {
    
    _debugLog('[Instruction::CallInterface] error during sync call', {
      taskID: task.id(),
      subtaskID: task.getParentSubtask()?.id(),
      err,
    });
    task.setErrored(err);
    task.reject(err);
    task.exit();
    throw err;
    
  }
  
  for (const rsc of curResourceBorrows) {
    rsc[symbolRscHandle] = undefined;
  }
  curResourceBorrows = [];
  
  if (!(ret instanceof Pollable)) {
    throw new TypeError('Resource error: Not a valid \"Pollable\" resource.');
  }
  var handle3 = ret[symbolRscHandle];
  if (!handle3) {
    const rep = ret[symbolRscRep] || ++captureCnt2;
    captureTable2.set(rep, ret);
    handle3 = rscTableCreateOwn(handleTable2, rep);
  }
  
  _debugLog('[iface="wasi:http/types@0.2.10", function="[method]future-incoming-response.subscribe"][Instruction::Return]', {
    funcName: '[method]future-incoming-response.subscribe',
    paramCount: 1,
    async: false,
    postReturn: false
  });
  task.resolve([handle3]);
  task.exit();
  return handle3;
}
_trampoline20.fnName = 'wasi:http/types@0.2.10#subscribe';
let exports1;

const _trampoline27 = function() {
  _debugLog('[iface="wasi:cli/stderr@0.2.10", function="get-stderr"] [Instruction::CallInterface] (sync, @ enter)');
  const hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1,
      isAsync: false,
      entryFnName: 'getStderr',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(
    0,
    _getGlobalCurrentTaskMeta(0)?.taskID,
    )?.task;
    
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  
  let ret;
  
  try {
    ret = _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => getStderr(),
    })
    ;
  } catch (err) {
    
    _debugLog('[Instruction::CallInterface] error during sync call', {
      taskID: task.id(),
      subtaskID: task.getParentSubtask()?.id(),
      err,
    });
    task.setErrored(err);
    task.reject(err);
    task.exit();
    throw err;
    
  }
  
  
  if (!(ret instanceof OutputStream)) {
    throw new TypeError('Resource error: Not a valid \"OutputStream\" resource.');
  }
  var handle0 = ret[symbolRscHandle];
  if (!handle0) {
    const rep = ret[symbolRscRep] || ++captureCnt4;
    captureTable4.set(rep, ret);
    handle0 = rscTableCreateOwn(handleTable4, rep);
  }
  
  _debugLog('[iface="wasi:cli/stderr@0.2.10", function="get-stderr"][Instruction::Return]', {
    funcName: 'get-stderr',
    paramCount: 1,
    async: false,
    postReturn: false
  });
  task.resolve([handle0]);
  task.exit();
  return handle0;
}
_trampoline27.fnName = 'wasi:cli/stderr@0.2.10#getStderr';

const _trampoline30 = function() {
  _debugLog('[iface="wasi:cli/stdin@0.2.10", function="get-stdin"] [Instruction::CallInterface] (sync, @ enter)');
  const hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1,
      isAsync: false,
      entryFnName: 'getStdin',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(
    0,
    _getGlobalCurrentTaskMeta(0)?.taskID,
    )?.task;
    
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  
  let ret;
  
  try {
    ret = _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => getStdin(),
    })
    ;
  } catch (err) {
    
    _debugLog('[Instruction::CallInterface] error during sync call', {
      taskID: task.id(),
      subtaskID: task.getParentSubtask()?.id(),
      err,
    });
    task.setErrored(err);
    task.reject(err);
    task.exit();
    throw err;
    
  }
  
  
  if (!(ret instanceof InputStream)) {
    throw new TypeError('Resource error: Not a valid \"InputStream\" resource.');
  }
  var handle0 = ret[symbolRscHandle];
  if (!handle0) {
    const rep = ret[symbolRscRep] || ++captureCnt3;
    captureTable3.set(rep, ret);
    handle0 = rscTableCreateOwn(handleTable3, rep);
  }
  
  _debugLog('[iface="wasi:cli/stdin@0.2.10", function="get-stdin"][Instruction::Return]', {
    funcName: 'get-stdin',
    paramCount: 1,
    async: false,
    postReturn: false
  });
  task.resolve([handle0]);
  task.exit();
  return handle0;
}
_trampoline30.fnName = 'wasi:cli/stdin@0.2.10#getStdin';

const _trampoline31 = function() {
  _debugLog('[iface="wasi:cli/stdout@0.2.10", function="get-stdout"] [Instruction::CallInterface] (sync, @ enter)');
  const hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1,
      isAsync: false,
      entryFnName: 'getStdout',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(
    0,
    _getGlobalCurrentTaskMeta(0)?.taskID,
    )?.task;
    
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  
  let ret;
  
  try {
    ret = _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => getStdout(),
    })
    ;
  } catch (err) {
    
    _debugLog('[Instruction::CallInterface] error during sync call', {
      taskID: task.id(),
      subtaskID: task.getParentSubtask()?.id(),
      err,
    });
    task.setErrored(err);
    task.reject(err);
    task.exit();
    throw err;
    
  }
  
  
  if (!(ret instanceof OutputStream)) {
    throw new TypeError('Resource error: Not a valid \"OutputStream\" resource.');
  }
  var handle0 = ret[symbolRscHandle];
  if (!handle0) {
    const rep = ret[symbolRscRep] || ++captureCnt4;
    captureTable4.set(rep, ret);
    handle0 = rscTableCreateOwn(handleTable4, rep);
  }
  
  _debugLog('[iface="wasi:cli/stdout@0.2.10", function="get-stdout"][Instruction::Return]', {
    funcName: 'get-stdout',
    paramCount: 1,
    async: false,
    postReturn: false
  });
  task.resolve([handle0]);
  task.exit();
  return handle0;
}
_trampoline31.fnName = 'wasi:cli/stdout@0.2.10#getStdout';
let exports2;
let memory0;
let realloc0;
let realloc0Async;
let realloc1;
let realloc1Async;

const _trampoline32 = function(arg0, arg1, arg2) {
  var len3 = arg1;
  var base3 = arg0;
  var result3 = [];
  for (let i = 0; i < len3; i++) {
    const base = base3 + i * 4;
    var handle1 = dataView(memory0).getInt32(base + 0, true);
    
    var rep2 = handleTable2[(handle1 << 1) + 1] & ~T_FLAG;
    var rsc0 = captureTable2.get(rep2);
    if (!rsc0) {
      rsc0 = Object.create(Pollable.prototype);
      Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
      Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
    }
    
    curResourceBorrows.push(rsc0);
    result3.push(rsc0);
  }
  _debugLog('[iface="wasi:io/poll@0.2.10", function="poll"] [Instruction::CallInterface] (sync, @ enter)');
  const hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1,
      isAsync: false,
      entryFnName: 'poll',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(
    0,
    _getGlobalCurrentTaskMeta(0)?.taskID,
    )?.task;
    
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  
  let ret;
  
  try {
    ret = _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => poll(result3),
    })
    ;
  } catch (err) {
    
    _debugLog('[Instruction::CallInterface] error during sync call', {
      taskID: task.id(),
      subtaskID: task.getParentSubtask()?.id(),
      err,
    });
    task.setErrored(err);
    task.reject(err);
    task.exit();
    throw err;
    
  }
  
  for (const rsc of curResourceBorrows) {
    rsc[symbolRscHandle] = undefined;
  }
  curResourceBorrows = [];
  var val4 = ret;
  var len4 = val4.length;
  var ptr4 = realloc0(0, 0, 4, len4 * 4);
  
  let valData4;
  const valLenBytes4 = len4 * 4;
  if (Array.isArray(val4)) {
    // Regular array likely containing numbers, write values to memory
    let offset = 0;
    const dv4 = new DataView(memory0.buffer);
    for (const v of val4) {
      _requireValidNumericPrimitive.bind(null, 'u32')(v);
      dv4.setUint32(ptr4+ offset, v, true);
      offset += 4;
    }
  } else {
    // TypedArray / ArrayBuffer-like, direct copy
    valData4 = new Uint8Array(val4.buffer || val4, val4.byteOffset, valLenBytes4);
    const out4 = new Uint8Array(memory0.buffer, ptr4, valLenBytes4);
    out4.set(valData4);
  }
  
  dataView(memory0).setUint32(arg2 + 4, len4, true);
  dataView(memory0).setUint32(arg2 + 0, ptr4, true);
  _debugLog('[iface="wasi:io/poll@0.2.10", function="poll"][Instruction::Return]', {
    funcName: 'poll',
    paramCount: 0,
    async: false,
    postReturn: false
  });
  task.resolve([ret]);
  task.exit();
}
_trampoline32.fnName = 'wasi:io/poll@0.2.10#poll';

const handleTable1 = [T_FLAG, 0];
handleTable1._createdReps = new Set();


const captureTable1= new Map();
let captureCnt1= 0;

HANDLE_TABLES[1] = handleTable1;

const _trampoline33 = function(arg0, arg1, arg2) {
  var handle1 = arg0;
  
  var rep2 = handleTable3[(handle1 << 1) + 1] & ~T_FLAG;
  var rsc0 = captureTable3.get(rep2);
  if (!rsc0) {
    rsc0 = Object.create(InputStream.prototype);
    Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
    Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
  }
  
  curResourceBorrows.push(rsc0);
  _debugLog('[iface="wasi:io/streams@0.2.10", function="[method]input-stream.read"] [Instruction::CallInterface] (sync, @ enter)');
  const hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1,
      isAsync: false,
      entryFnName: 'read',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'result-catch-handler',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(
    0,
    _getGlobalCurrentTaskMeta(0)?.taskID,
    )?.task;
    
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  
  let ret;
  try {
    ret = { tag: 'ok', val: _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => rsc0.read(BigInt.asUintN(64, BigInt(arg1))),
    })
  };
} catch (e) {
  ret = { tag: 'err', val: getErrorPayload(e) };
}

for (const rsc of curResourceBorrows) {
  rsc[symbolRscHandle] = undefined;
}
curResourceBorrows = [];
var variant6 = ret;
switch (variant6.tag) {
  case 'ok': {
    const e = variant6.val;
    dataView(memory0).setInt8(arg2 + 0, 0, true);
    var val3 = e;
    var len3 = Array.isArray(val3) ? val3.length : val3.byteLength;
    var ptr3 = realloc0(0, 0, 1, len3 * 1);
    
    let valData3;
    const valLenBytes3 = len3 * 1;
    if (Array.isArray(val3)) {
      // Regular array likely containing numbers, write values to memory
      let offset = 0;
      const dv3 = new DataView(memory0.buffer);
      for (const v of val3) {
        _requireValidNumericPrimitive.bind(null, 'u8')(v);
        dv3.setUint8(ptr3+ offset, v, true);
        offset += 1;
      }
    } else {
      // TypedArray / ArrayBuffer-like, direct copy
      valData3 = new Uint8Array(val3.buffer || val3, val3.byteOffset, valLenBytes3);
      const out3 = new Uint8Array(memory0.buffer, ptr3, valLenBytes3);
      out3.set(valData3);
    }
    
    dataView(memory0).setUint32(arg2 + 8, len3, true);
    dataView(memory0).setUint32(arg2 + 4, ptr3, true);
    
    break;
  }
  case 'err': {
    const e = variant6.val;
    dataView(memory0).setInt8(arg2 + 0, 1, true);
    var variant5 = e;
    switch (variant5.tag) {
      case 'last-operation-failed': {
        const e = variant5.val;
        dataView(memory0).setInt8(arg2 + 4, 0, true);
        
        if (!(e instanceof Error$1)) {
          throw new TypeError('Resource error: Not a valid \"Error\" resource.');
        }
        var handle4 = e[symbolRscHandle];
        if (!handle4) {
          const rep = e[symbolRscRep] || ++captureCnt1;
          captureTable1.set(rep, e);
          handle4 = rscTableCreateOwn(handleTable1, rep);
        }
        
        dataView(memory0).setInt32(arg2 + 8, handle4, true);
        break;
      }
      case 'closed': {
        dataView(memory0).setInt8(arg2 + 4, 1, true);
        break;
      }
      default: {
        throw new TypeError(`invalid variant tag value \`${JSON.stringify(variant5.tag)}\` (received \`${variant5}\`) specified for \`StreamError\``);
      }
    }
    
    break;
  }
  default: {
    _debugLog("ERROR: invalid value (expected result as object with 'tag' member)", { value: variant6, valueType: typeof variant6});
    throw new TypeError('invalid variant specified for result');
  }
}
_debugLog('[iface="wasi:io/streams@0.2.10", function="[method]input-stream.read"][Instruction::Return]', {
  funcName: '[method]input-stream.read',
  paramCount: 0,
  async: false,
  postReturn: false
});
task.resolve([ret]);
task.exit();
}
_trampoline33.fnName = 'wasi:io/streams@0.2.10#read';

const _trampoline34 = function(arg0, arg1, arg2) {
  var handle1 = arg0;
  
  var rep2 = handleTable3[(handle1 << 1) + 1] & ~T_FLAG;
  var rsc0 = captureTable3.get(rep2);
  if (!rsc0) {
    rsc0 = Object.create(InputStream.prototype);
    Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
    Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
  }
  
  curResourceBorrows.push(rsc0);
  _debugLog('[iface="wasi:io/streams@0.2.10", function="[method]input-stream.blocking-read"] [Instruction::CallInterface] (sync, @ enter)');
  const hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1,
      isAsync: false,
      entryFnName: 'blockingRead',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'result-catch-handler',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(
    0,
    _getGlobalCurrentTaskMeta(0)?.taskID,
    )?.task;
    
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  
  let ret;
  try {
    ret = { tag: 'ok', val: _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => rsc0.blockingRead(BigInt.asUintN(64, BigInt(arg1))),
    })
  };
} catch (e) {
  ret = { tag: 'err', val: getErrorPayload(e) };
}

for (const rsc of curResourceBorrows) {
  rsc[symbolRscHandle] = undefined;
}
curResourceBorrows = [];
var variant6 = ret;
switch (variant6.tag) {
  case 'ok': {
    const e = variant6.val;
    dataView(memory0).setInt8(arg2 + 0, 0, true);
    var val3 = e;
    var len3 = Array.isArray(val3) ? val3.length : val3.byteLength;
    var ptr3 = realloc0(0, 0, 1, len3 * 1);
    
    let valData3;
    const valLenBytes3 = len3 * 1;
    if (Array.isArray(val3)) {
      // Regular array likely containing numbers, write values to memory
      let offset = 0;
      const dv3 = new DataView(memory0.buffer);
      for (const v of val3) {
        _requireValidNumericPrimitive.bind(null, 'u8')(v);
        dv3.setUint8(ptr3+ offset, v, true);
        offset += 1;
      }
    } else {
      // TypedArray / ArrayBuffer-like, direct copy
      valData3 = new Uint8Array(val3.buffer || val3, val3.byteOffset, valLenBytes3);
      const out3 = new Uint8Array(memory0.buffer, ptr3, valLenBytes3);
      out3.set(valData3);
    }
    
    dataView(memory0).setUint32(arg2 + 8, len3, true);
    dataView(memory0).setUint32(arg2 + 4, ptr3, true);
    
    break;
  }
  case 'err': {
    const e = variant6.val;
    dataView(memory0).setInt8(arg2 + 0, 1, true);
    var variant5 = e;
    switch (variant5.tag) {
      case 'last-operation-failed': {
        const e = variant5.val;
        dataView(memory0).setInt8(arg2 + 4, 0, true);
        
        if (!(e instanceof Error$1)) {
          throw new TypeError('Resource error: Not a valid \"Error\" resource.');
        }
        var handle4 = e[symbolRscHandle];
        if (!handle4) {
          const rep = e[symbolRscRep] || ++captureCnt1;
          captureTable1.set(rep, e);
          handle4 = rscTableCreateOwn(handleTable1, rep);
        }
        
        dataView(memory0).setInt32(arg2 + 8, handle4, true);
        break;
      }
      case 'closed': {
        dataView(memory0).setInt8(arg2 + 4, 1, true);
        break;
      }
      default: {
        throw new TypeError(`invalid variant tag value \`${JSON.stringify(variant5.tag)}\` (received \`${variant5}\`) specified for \`StreamError\``);
      }
    }
    
    break;
  }
  default: {
    _debugLog("ERROR: invalid value (expected result as object with 'tag' member)", { value: variant6, valueType: typeof variant6});
    throw new TypeError('invalid variant specified for result');
  }
}
_debugLog('[iface="wasi:io/streams@0.2.10", function="[method]input-stream.blocking-read"][Instruction::Return]', {
  funcName: '[method]input-stream.blocking-read',
  paramCount: 0,
  async: false,
  postReturn: false
});
task.resolve([ret]);
task.exit();
}
_trampoline34.fnName = 'wasi:io/streams@0.2.10#blockingRead';

const _trampoline35 = function(arg0, arg1) {
  var handle1 = arg0;
  
  var rep2 = handleTable4[(handle1 << 1) + 1] & ~T_FLAG;
  var rsc0 = captureTable4.get(rep2);
  if (!rsc0) {
    rsc0 = Object.create(OutputStream.prototype);
    Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
    Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
  }
  
  curResourceBorrows.push(rsc0);
  _debugLog('[iface="wasi:io/streams@0.2.10", function="[method]output-stream.check-write"] [Instruction::CallInterface] (sync, @ enter)');
  const hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1,
      isAsync: false,
      entryFnName: 'checkWrite',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'result-catch-handler',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(
    0,
    _getGlobalCurrentTaskMeta(0)?.taskID,
    )?.task;
    
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  
  let ret;
  try {
    ret = { tag: 'ok', val: _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => rsc0.checkWrite(),
    })
  };
} catch (e) {
  ret = { tag: 'err', val: getErrorPayload(e) };
}

for (const rsc of curResourceBorrows) {
  rsc[symbolRscHandle] = undefined;
}
curResourceBorrows = [];
var variant5 = ret;
switch (variant5.tag) {
  case 'ok': {
    const e = variant5.val;
    dataView(memory0).setInt8(arg1 + 0, 0, true);
    dataView(memory0).setBigInt64(arg1 + 8, toUint64(e), true);
    
    break;
  }
  case 'err': {
    const e = variant5.val;
    dataView(memory0).setInt8(arg1 + 0, 1, true);
    var variant4 = e;
    switch (variant4.tag) {
      case 'last-operation-failed': {
        const e = variant4.val;
        dataView(memory0).setInt8(arg1 + 8, 0, true);
        
        if (!(e instanceof Error$1)) {
          throw new TypeError('Resource error: Not a valid \"Error\" resource.');
        }
        var handle3 = e[symbolRscHandle];
        if (!handle3) {
          const rep = e[symbolRscRep] || ++captureCnt1;
          captureTable1.set(rep, e);
          handle3 = rscTableCreateOwn(handleTable1, rep);
        }
        
        dataView(memory0).setInt32(arg1 + 12, handle3, true);
        break;
      }
      case 'closed': {
        dataView(memory0).setInt8(arg1 + 8, 1, true);
        break;
      }
      default: {
        throw new TypeError(`invalid variant tag value \`${JSON.stringify(variant4.tag)}\` (received \`${variant4}\`) specified for \`StreamError\``);
      }
    }
    
    break;
  }
  default: {
    _debugLog("ERROR: invalid value (expected result as object with 'tag' member)", { value: variant5, valueType: typeof variant5});
    throw new TypeError('invalid variant specified for result');
  }
}
_debugLog('[iface="wasi:io/streams@0.2.10", function="[method]output-stream.check-write"][Instruction::Return]', {
  funcName: '[method]output-stream.check-write',
  paramCount: 0,
  async: false,
  postReturn: false
});
task.resolve([ret]);
task.exit();
}
_trampoline35.fnName = 'wasi:io/streams@0.2.10#checkWrite';

const _trampoline36 = function(arg0, arg1, arg2, arg3) {
  var handle1 = arg0;
  
  var rep2 = handleTable4[(handle1 << 1) + 1] & ~T_FLAG;
  var rsc0 = captureTable4.get(rep2);
  if (!rsc0) {
    rsc0 = Object.create(OutputStream.prototype);
    Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
    Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
  }
  
  curResourceBorrows.push(rsc0);
  var ptr3 = arg1;
  var len3 = arg2;
  var result3 = new Uint8Array(memory0.buffer.slice(ptr3, ptr3 + len3 * 1));
  _debugLog('[iface="wasi:io/streams@0.2.10", function="[method]output-stream.write"] [Instruction::CallInterface] (sync, @ enter)');
  const hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1,
      isAsync: false,
      entryFnName: 'write',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'result-catch-handler',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(
    0,
    _getGlobalCurrentTaskMeta(0)?.taskID,
    )?.task;
    
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  
  let ret;
  try {
    ret = { tag: 'ok', val: _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => rsc0.write(result3),
    })
  };
} catch (e) {
  ret = { tag: 'err', val: getErrorPayload(e) };
}

for (const rsc of curResourceBorrows) {
  rsc[symbolRscHandle] = undefined;
}
curResourceBorrows = [];
var variant6 = ret;
switch (variant6.tag) {
  case 'ok': {
    const e = variant6.val;
    dataView(memory0).setInt8(arg3 + 0, 0, true);
    
    break;
  }
  case 'err': {
    const e = variant6.val;
    dataView(memory0).setInt8(arg3 + 0, 1, true);
    var variant5 = e;
    switch (variant5.tag) {
      case 'last-operation-failed': {
        const e = variant5.val;
        dataView(memory0).setInt8(arg3 + 4, 0, true);
        
        if (!(e instanceof Error$1)) {
          throw new TypeError('Resource error: Not a valid \"Error\" resource.');
        }
        var handle4 = e[symbolRscHandle];
        if (!handle4) {
          const rep = e[symbolRscRep] || ++captureCnt1;
          captureTable1.set(rep, e);
          handle4 = rscTableCreateOwn(handleTable1, rep);
        }
        
        dataView(memory0).setInt32(arg3 + 8, handle4, true);
        break;
      }
      case 'closed': {
        dataView(memory0).setInt8(arg3 + 4, 1, true);
        break;
      }
      default: {
        throw new TypeError(`invalid variant tag value \`${JSON.stringify(variant5.tag)}\` (received \`${variant5}\`) specified for \`StreamError\``);
      }
    }
    
    break;
  }
  default: {
    _debugLog("ERROR: invalid value (expected result as object with 'tag' member)", { value: variant6, valueType: typeof variant6});
    throw new TypeError('invalid variant specified for result');
  }
}
_debugLog('[iface="wasi:io/streams@0.2.10", function="[method]output-stream.write"][Instruction::Return]', {
  funcName: '[method]output-stream.write',
  paramCount: 0,
  async: false,
  postReturn: false
});
task.resolve([ret]);
task.exit();
}
_trampoline36.fnName = 'wasi:io/streams@0.2.10#write';

const _trampoline37 = function(arg0, arg1) {
  var handle1 = arg0;
  
  var rep2 = handleTable4[(handle1 << 1) + 1] & ~T_FLAG;
  var rsc0 = captureTable4.get(rep2);
  if (!rsc0) {
    rsc0 = Object.create(OutputStream.prototype);
    Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
    Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
  }
  
  curResourceBorrows.push(rsc0);
  _debugLog('[iface="wasi:io/streams@0.2.10", function="[method]output-stream.blocking-flush"] [Instruction::CallInterface] (sync, @ enter)');
  const hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1,
      isAsync: false,
      entryFnName: 'blockingFlush',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'result-catch-handler',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(
    0,
    _getGlobalCurrentTaskMeta(0)?.taskID,
    )?.task;
    
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  
  let ret;
  try {
    ret = { tag: 'ok', val: _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => rsc0.blockingFlush(),
    })
  };
} catch (e) {
  ret = { tag: 'err', val: getErrorPayload(e) };
}

for (const rsc of curResourceBorrows) {
  rsc[symbolRscHandle] = undefined;
}
curResourceBorrows = [];
var variant5 = ret;
switch (variant5.tag) {
  case 'ok': {
    const e = variant5.val;
    dataView(memory0).setInt8(arg1 + 0, 0, true);
    
    break;
  }
  case 'err': {
    const e = variant5.val;
    dataView(memory0).setInt8(arg1 + 0, 1, true);
    var variant4 = e;
    switch (variant4.tag) {
      case 'last-operation-failed': {
        const e = variant4.val;
        dataView(memory0).setInt8(arg1 + 4, 0, true);
        
        if (!(e instanceof Error$1)) {
          throw new TypeError('Resource error: Not a valid \"Error\" resource.');
        }
        var handle3 = e[symbolRscHandle];
        if (!handle3) {
          const rep = e[symbolRscRep] || ++captureCnt1;
          captureTable1.set(rep, e);
          handle3 = rscTableCreateOwn(handleTable1, rep);
        }
        
        dataView(memory0).setInt32(arg1 + 8, handle3, true);
        break;
      }
      case 'closed': {
        dataView(memory0).setInt8(arg1 + 4, 1, true);
        break;
      }
      default: {
        throw new TypeError(`invalid variant tag value \`${JSON.stringify(variant4.tag)}\` (received \`${variant4}\`) specified for \`StreamError\``);
      }
    }
    
    break;
  }
  default: {
    _debugLog("ERROR: invalid value (expected result as object with 'tag' member)", { value: variant5, valueType: typeof variant5});
    throw new TypeError('invalid variant specified for result');
  }
}
_debugLog('[iface="wasi:io/streams@0.2.10", function="[method]output-stream.blocking-flush"][Instruction::Return]', {
  funcName: '[method]output-stream.blocking-flush',
  paramCount: 0,
  async: false,
  postReturn: false
});
task.resolve([ret]);
task.exit();
}
_trampoline37.fnName = 'wasi:io/streams@0.2.10#blockingFlush';

const _trampoline38 = function(arg0, arg1) {
  _debugLog('[iface="wasi:random/random@0.2.10", function="get-random-bytes"] [Instruction::CallInterface] (sync, @ enter)');
  const hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1,
      isAsync: false,
      entryFnName: 'getRandomBytes',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(
    0,
    _getGlobalCurrentTaskMeta(0)?.taskID,
    )?.task;
    
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  
  let ret;
  
  try {
    ret = _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => getRandomBytes(BigInt.asUintN(64, BigInt(arg0))),
    })
    ;
  } catch (err) {
    
    _debugLog('[Instruction::CallInterface] error during sync call', {
      taskID: task.id(),
      subtaskID: task.getParentSubtask()?.id(),
      err,
    });
    task.setErrored(err);
    task.reject(err);
    task.exit();
    throw err;
    
  }
  
  var val0 = ret;
  var len0 = Array.isArray(val0) ? val0.length : val0.byteLength;
  var ptr0 = realloc0(0, 0, 1, len0 * 1);
  
  let valData0;
  const valLenBytes0 = len0 * 1;
  if (Array.isArray(val0)) {
    // Regular array likely containing numbers, write values to memory
    let offset = 0;
    const dv0 = new DataView(memory0.buffer);
    for (const v of val0) {
      _requireValidNumericPrimitive.bind(null, 'u8')(v);
      dv0.setUint8(ptr0+ offset, v, true);
      offset += 1;
    }
  } else {
    // TypedArray / ArrayBuffer-like, direct copy
    valData0 = new Uint8Array(val0.buffer || val0, val0.byteOffset, valLenBytes0);
    const out0 = new Uint8Array(memory0.buffer, ptr0, valLenBytes0);
    out0.set(valData0);
  }
  
  dataView(memory0).setUint32(arg1 + 4, len0, true);
  dataView(memory0).setUint32(arg1 + 0, ptr0, true);
  _debugLog('[iface="wasi:random/random@0.2.10", function="get-random-bytes"][Instruction::Return]', {
    funcName: 'get-random-bytes',
    paramCount: 0,
    async: false,
    postReturn: false
  });
  task.resolve([ret]);
  task.exit();
}
_trampoline38.fnName = 'wasi:random/random@0.2.10#getRandomBytes';

const _trampoline39 = function(arg0, arg1, arg2) {
  var len2 = arg1;
  var base2 = arg0;
  var result2 = [];
  for (let i = 0; i < len2; i++) {
    const base = base2 + i * 16;
    var ptr0 = dataView(memory0).getUint32(base + 0, true);
    var len0 = dataView(memory0).getUint32(base + 4, true);
    var result0 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr0, len0));
    var ptr1 = dataView(memory0).getUint32(base + 8, true);
    var len1 = dataView(memory0).getUint32(base + 12, true);
    var result1 = new Uint8Array(memory0.buffer.slice(ptr1, ptr1 + len1 * 1));
    result2.push([result0, result1]);
  }
  _debugLog('[iface="wasi:http/types@0.2.10", function="[static]fields.from-list"] [Instruction::CallInterface] (sync, @ enter)');
  const hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1,
      isAsync: false,
      entryFnName: 'Fields.fromList',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'result-catch-handler',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(
    0,
    _getGlobalCurrentTaskMeta(0)?.taskID,
    )?.task;
    
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  
  let ret;
  try {
    ret = { tag: 'ok', val: _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => Fields.fromList(result2),
    })
  };
} catch (e) {
  ret = { tag: 'err', val: getErrorPayload(e) };
}

var variant5 = ret;
switch (variant5.tag) {
  case 'ok': {
    const e = variant5.val;
    dataView(memory0).setInt8(arg2 + 0, 0, true);
    
    if (!(e instanceof Fields)) {
      throw new TypeError('Resource error: Not a valid \"Fields\" resource.');
    }
    var handle3 = e[symbolRscHandle];
    if (!handle3) {
      const rep = e[symbolRscRep] || ++captureCnt8;
      captureTable8.set(rep, e);
      handle3 = rscTableCreateOwn(handleTable8, rep);
    }
    
    dataView(memory0).setInt32(arg2 + 4, handle3, true);
    
    break;
  }
  case 'err': {
    const e = variant5.val;
    dataView(memory0).setInt8(arg2 + 0, 1, true);
    var variant4 = e;
    switch (variant4.tag) {
      case 'invalid-syntax': {
        dataView(memory0).setInt8(arg2 + 4, 0, true);
        break;
      }
      case 'forbidden': {
        dataView(memory0).setInt8(arg2 + 4, 1, true);
        break;
      }
      case 'immutable': {
        dataView(memory0).setInt8(arg2 + 4, 2, true);
        break;
      }
      default: {
        throw new TypeError(`invalid variant tag value \`${JSON.stringify(variant4.tag)}\` (received \`${variant4}\`) specified for \`HeaderError\``);
      }
    }
    
    break;
  }
  default: {
    _debugLog("ERROR: invalid value (expected result as object with 'tag' member)", { value: variant5, valueType: typeof variant5});
    throw new TypeError('invalid variant specified for result');
  }
}
_debugLog('[iface="wasi:http/types@0.2.10", function="[static]fields.from-list"][Instruction::Return]', {
  funcName: '[static]fields.from-list',
  paramCount: 0,
  async: false,
  postReturn: false
});
task.resolve([ret]);
task.exit();
}
_trampoline39.fnName = 'wasi:http/types@0.2.10#Fields.fromList';

const _trampoline40 = function(arg0, arg1, arg2, arg3) {
  var handle1 = arg0;
  
  var rep2 = handleTable8[(handle1 << 1) + 1] & ~T_FLAG;
  var rsc0 = captureTable8.get(rep2);
  if (!rsc0) {
    rsc0 = Object.create(Fields.prototype);
    Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
    Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
  }
  
  curResourceBorrows.push(rsc0);
  var ptr3 = arg1;
  var len3 = arg2;
  var result3 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr3, len3));
  _debugLog('[iface="wasi:http/types@0.2.10", function="[method]fields.get"] [Instruction::CallInterface] (sync, @ enter)');
  const hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1,
      isAsync: false,
      entryFnName: 'get',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(
    0,
    _getGlobalCurrentTaskMeta(0)?.taskID,
    )?.task;
    
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  
  let ret;
  
  try {
    ret = _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => rsc0.get(result3),
    })
    ;
  } catch (err) {
    
    _debugLog('[Instruction::CallInterface] error during sync call', {
      taskID: task.id(),
      subtaskID: task.getParentSubtask()?.id(),
      err,
    });
    task.setErrored(err);
    task.reject(err);
    task.exit();
    throw err;
    
  }
  
  for (const rsc of curResourceBorrows) {
    rsc[symbolRscHandle] = undefined;
  }
  curResourceBorrows = [];
  var vec5 = ret;
  var len5 = vec5.length;
  var result5 = realloc0(0, 0, 4, len5 * 8);
  for (let i = 0; i < vec5.length; i++) {
    const e = vec5[i];
    const base = result5 + i * 8;var val4 = e;
    var len4 = Array.isArray(val4) ? val4.length : val4.byteLength;
    var ptr4 = realloc0(0, 0, 1, len4 * 1);
    
    let valData4;
    const valLenBytes4 = len4 * 1;
    if (Array.isArray(val4)) {
      // Regular array likely containing numbers, write values to memory
      let offset = 0;
      const dv4 = new DataView(memory0.buffer);
      for (const v of val4) {
        _requireValidNumericPrimitive.bind(null, 'u8')(v);
        dv4.setUint8(ptr4+ offset, v, true);
        offset += 1;
      }
    } else {
      // TypedArray / ArrayBuffer-like, direct copy
      valData4 = new Uint8Array(val4.buffer || val4, val4.byteOffset, valLenBytes4);
      const out4 = new Uint8Array(memory0.buffer, ptr4, valLenBytes4);
      out4.set(valData4);
    }
    
    dataView(memory0).setUint32(base + 4, len4, true);
    dataView(memory0).setUint32(base + 0, ptr4, true);
  }
  dataView(memory0).setUint32(arg3 + 4, len5, true);
  dataView(memory0).setUint32(arg3 + 0, result5, true);
  _debugLog('[iface="wasi:http/types@0.2.10", function="[method]fields.get"][Instruction::Return]', {
    funcName: '[method]fields.get',
    paramCount: 0,
    async: false,
    postReturn: false
  });
  task.resolve([ret]);
  task.exit();
}
_trampoline40.fnName = 'wasi:http/types@0.2.10#get';

const _trampoline41 = function(arg0, arg1, arg2) {
  var handle1 = arg0;
  
  var rep2 = handleTable8[(handle1 << 1) + 1] & ~T_FLAG;
  var rsc0 = captureTable8.get(rep2);
  if (!rsc0) {
    rsc0 = Object.create(Fields.prototype);
    Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
    Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
  }
  
  curResourceBorrows.push(rsc0);
  var ptr3 = arg1;
  var len3 = arg2;
  var result3 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr3, len3));
  _debugLog('[iface="wasi:http/types@0.2.10", function="[method]fields.has"] [Instruction::CallInterface] (sync, @ enter)');
  const hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1,
      isAsync: false,
      entryFnName: 'has',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(
    0,
    _getGlobalCurrentTaskMeta(0)?.taskID,
    )?.task;
    
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  
  let ret;
  
  try {
    ret = _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => rsc0.has(result3),
    })
    ;
  } catch (err) {
    
    _debugLog('[Instruction::CallInterface] error during sync call', {
      taskID: task.id(),
      subtaskID: task.getParentSubtask()?.id(),
      err,
    });
    task.setErrored(err);
    task.reject(err);
    task.exit();
    throw err;
    
  }
  
  for (const rsc of curResourceBorrows) {
    rsc[symbolRscHandle] = undefined;
  }
  curResourceBorrows = [];
  _debugLog('[iface="wasi:http/types@0.2.10", function="[method]fields.has"][Instruction::Return]', {
    funcName: '[method]fields.has',
    paramCount: 1,
    async: false,
    postReturn: false
  });
  task.resolve([ret ? 1 : 0]);
  task.exit();
  return ret ? 1 : 0;
}
_trampoline41.fnName = 'wasi:http/types@0.2.10#has';

const _trampoline42 = function(arg0, arg1, arg2, arg3, arg4, arg5) {
  var handle1 = arg0;
  
  var rep2 = handleTable8[(handle1 << 1) + 1] & ~T_FLAG;
  var rsc0 = captureTable8.get(rep2);
  if (!rsc0) {
    rsc0 = Object.create(Fields.prototype);
    Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
    Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
  }
  
  curResourceBorrows.push(rsc0);
  var ptr3 = arg1;
  var len3 = arg2;
  var result3 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr3, len3));
  var len5 = arg4;
  var base5 = arg3;
  var result5 = [];
  for (let i = 0; i < len5; i++) {
    const base = base5 + i * 8;
    var ptr4 = dataView(memory0).getUint32(base + 0, true);
    var len4 = dataView(memory0).getUint32(base + 4, true);
    var result4 = new Uint8Array(memory0.buffer.slice(ptr4, ptr4 + len4 * 1));
    result5.push(result4);
  }
  _debugLog('[iface="wasi:http/types@0.2.10", function="[method]fields.set"] [Instruction::CallInterface] (sync, @ enter)');
  const hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1,
      isAsync: false,
      entryFnName: 'set',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'result-catch-handler',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(
    0,
    _getGlobalCurrentTaskMeta(0)?.taskID,
    )?.task;
    
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  
  let ret;
  try {
    ret = { tag: 'ok', val: _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => rsc0.set(result3, result5),
    })
  };
} catch (e) {
  ret = { tag: 'err', val: getErrorPayload(e) };
}

for (const rsc of curResourceBorrows) {
  rsc[symbolRscHandle] = undefined;
}
curResourceBorrows = [];
var variant7 = ret;
switch (variant7.tag) {
  case 'ok': {
    const e = variant7.val;
    dataView(memory0).setInt8(arg5 + 0, 0, true);
    
    break;
  }
  case 'err': {
    const e = variant7.val;
    dataView(memory0).setInt8(arg5 + 0, 1, true);
    var variant6 = e;
    switch (variant6.tag) {
      case 'invalid-syntax': {
        dataView(memory0).setInt8(arg5 + 1, 0, true);
        break;
      }
      case 'forbidden': {
        dataView(memory0).setInt8(arg5 + 1, 1, true);
        break;
      }
      case 'immutable': {
        dataView(memory0).setInt8(arg5 + 1, 2, true);
        break;
      }
      default: {
        throw new TypeError(`invalid variant tag value \`${JSON.stringify(variant6.tag)}\` (received \`${variant6}\`) specified for \`HeaderError\``);
      }
    }
    
    break;
  }
  default: {
    _debugLog("ERROR: invalid value (expected result as object with 'tag' member)", { value: variant7, valueType: typeof variant7});
    throw new TypeError('invalid variant specified for result');
  }
}
_debugLog('[iface="wasi:http/types@0.2.10", function="[method]fields.set"][Instruction::Return]', {
  funcName: '[method]fields.set',
  paramCount: 0,
  async: false,
  postReturn: false
});
task.resolve([ret]);
task.exit();
}
_trampoline42.fnName = 'wasi:http/types@0.2.10#set';

const _trampoline43 = function(arg0, arg1, arg2, arg3) {
  var handle1 = arg0;
  
  var rep2 = handleTable8[(handle1 << 1) + 1] & ~T_FLAG;
  var rsc0 = captureTable8.get(rep2);
  if (!rsc0) {
    rsc0 = Object.create(Fields.prototype);
    Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
    Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
  }
  
  curResourceBorrows.push(rsc0);
  var ptr3 = arg1;
  var len3 = arg2;
  var result3 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr3, len3));
  _debugLog('[iface="wasi:http/types@0.2.10", function="[method]fields.delete"] [Instruction::CallInterface] (sync, @ enter)');
  const hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1,
      isAsync: false,
      entryFnName: 'delete',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'result-catch-handler',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(
    0,
    _getGlobalCurrentTaskMeta(0)?.taskID,
    )?.task;
    
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  
  let ret;
  try {
    ret = { tag: 'ok', val: _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => rsc0.delete(result3),
    })
  };
} catch (e) {
  ret = { tag: 'err', val: getErrorPayload(e) };
}

for (const rsc of curResourceBorrows) {
  rsc[symbolRscHandle] = undefined;
}
curResourceBorrows = [];
var variant5 = ret;
switch (variant5.tag) {
  case 'ok': {
    const e = variant5.val;
    dataView(memory0).setInt8(arg3 + 0, 0, true);
    
    break;
  }
  case 'err': {
    const e = variant5.val;
    dataView(memory0).setInt8(arg3 + 0, 1, true);
    var variant4 = e;
    switch (variant4.tag) {
      case 'invalid-syntax': {
        dataView(memory0).setInt8(arg3 + 1, 0, true);
        break;
      }
      case 'forbidden': {
        dataView(memory0).setInt8(arg3 + 1, 1, true);
        break;
      }
      case 'immutable': {
        dataView(memory0).setInt8(arg3 + 1, 2, true);
        break;
      }
      default: {
        throw new TypeError(`invalid variant tag value \`${JSON.stringify(variant4.tag)}\` (received \`${variant4}\`) specified for \`HeaderError\``);
      }
    }
    
    break;
  }
  default: {
    _debugLog("ERROR: invalid value (expected result as object with 'tag' member)", { value: variant5, valueType: typeof variant5});
    throw new TypeError('invalid variant specified for result');
  }
}
_debugLog('[iface="wasi:http/types@0.2.10", function="[method]fields.delete"][Instruction::Return]', {
  funcName: '[method]fields.delete',
  paramCount: 0,
  async: false,
  postReturn: false
});
task.resolve([ret]);
task.exit();
}
_trampoline43.fnName = 'wasi:http/types@0.2.10#delete';

const _trampoline44 = function(arg0, arg1, arg2, arg3, arg4, arg5) {
  var handle1 = arg0;
  
  var rep2 = handleTable8[(handle1 << 1) + 1] & ~T_FLAG;
  var rsc0 = captureTable8.get(rep2);
  if (!rsc0) {
    rsc0 = Object.create(Fields.prototype);
    Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
    Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
  }
  
  curResourceBorrows.push(rsc0);
  var ptr3 = arg1;
  var len3 = arg2;
  var result3 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr3, len3));
  var ptr4 = arg3;
  var len4 = arg4;
  var result4 = new Uint8Array(memory0.buffer.slice(ptr4, ptr4 + len4 * 1));
  _debugLog('[iface="wasi:http/types@0.2.10", function="[method]fields.append"] [Instruction::CallInterface] (sync, @ enter)');
  const hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1,
      isAsync: false,
      entryFnName: 'append',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'result-catch-handler',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(
    0,
    _getGlobalCurrentTaskMeta(0)?.taskID,
    )?.task;
    
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  
  let ret;
  try {
    ret = { tag: 'ok', val: _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => rsc0.append(result3, result4),
    })
  };
} catch (e) {
  ret = { tag: 'err', val: getErrorPayload(e) };
}

for (const rsc of curResourceBorrows) {
  rsc[symbolRscHandle] = undefined;
}
curResourceBorrows = [];
var variant6 = ret;
switch (variant6.tag) {
  case 'ok': {
    const e = variant6.val;
    dataView(memory0).setInt8(arg5 + 0, 0, true);
    
    break;
  }
  case 'err': {
    const e = variant6.val;
    dataView(memory0).setInt8(arg5 + 0, 1, true);
    var variant5 = e;
    switch (variant5.tag) {
      case 'invalid-syntax': {
        dataView(memory0).setInt8(arg5 + 1, 0, true);
        break;
      }
      case 'forbidden': {
        dataView(memory0).setInt8(arg5 + 1, 1, true);
        break;
      }
      case 'immutable': {
        dataView(memory0).setInt8(arg5 + 1, 2, true);
        break;
      }
      default: {
        throw new TypeError(`invalid variant tag value \`${JSON.stringify(variant5.tag)}\` (received \`${variant5}\`) specified for \`HeaderError\``);
      }
    }
    
    break;
  }
  default: {
    _debugLog("ERROR: invalid value (expected result as object with 'tag' member)", { value: variant6, valueType: typeof variant6});
    throw new TypeError('invalid variant specified for result');
  }
}
_debugLog('[iface="wasi:http/types@0.2.10", function="[method]fields.append"][Instruction::Return]', {
  funcName: '[method]fields.append',
  paramCount: 0,
  async: false,
  postReturn: false
});
task.resolve([ret]);
task.exit();
}
_trampoline44.fnName = 'wasi:http/types@0.2.10#append';

const _trampoline45 = function(arg0, arg1) {
  var handle1 = arg0;
  
  var rep2 = handleTable8[(handle1 << 1) + 1] & ~T_FLAG;
  var rsc0 = captureTable8.get(rep2);
  if (!rsc0) {
    rsc0 = Object.create(Fields.prototype);
    Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
    Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
  }
  
  curResourceBorrows.push(rsc0);
  _debugLog('[iface="wasi:http/types@0.2.10", function="[method]fields.entries"] [Instruction::CallInterface] (sync, @ enter)');
  const hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1,
      isAsync: false,
      entryFnName: 'entries',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(
    0,
    _getGlobalCurrentTaskMeta(0)?.taskID,
    )?.task;
    
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  
  let ret;
  
  try {
    ret = _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => rsc0.entries(),
    })
    ;
  } catch (err) {
    
    _debugLog('[Instruction::CallInterface] error during sync call', {
      taskID: task.id(),
      subtaskID: task.getParentSubtask()?.id(),
      err,
    });
    task.setErrored(err);
    task.reject(err);
    task.exit();
    throw err;
    
  }
  
  for (const rsc of curResourceBorrows) {
    rsc[symbolRscHandle] = undefined;
  }
  curResourceBorrows = [];
  var vec6 = ret;
  var len6 = vec6.length;
  var result6 = realloc0(0, 0, 4, len6 * 16);
  for (let i = 0; i < vec6.length; i++) {
    const e = vec6[i];
    const base = result6 + i * 16;var [tuple3_0, tuple3_1] = e;
    
    var encodeRes = _utf8AllocateAndEncode(tuple3_0, realloc0, memory0);
    var ptr4= encodeRes.ptr;
    var len4 = encodeRes.len;
    
    dataView(memory0).setUint32(base + 4, len4, true);
    dataView(memory0).setUint32(base + 0, ptr4, true);
    var val5 = tuple3_1;
    var len5 = Array.isArray(val5) ? val5.length : val5.byteLength;
    var ptr5 = realloc0(0, 0, 1, len5 * 1);
    
    let valData5;
    const valLenBytes5 = len5 * 1;
    if (Array.isArray(val5)) {
      // Regular array likely containing numbers, write values to memory
      let offset = 0;
      const dv5 = new DataView(memory0.buffer);
      for (const v of val5) {
        _requireValidNumericPrimitive.bind(null, 'u8')(v);
        dv5.setUint8(ptr5+ offset, v, true);
        offset += 1;
      }
    } else {
      // TypedArray / ArrayBuffer-like, direct copy
      valData5 = new Uint8Array(val5.buffer || val5, val5.byteOffset, valLenBytes5);
      const out5 = new Uint8Array(memory0.buffer, ptr5, valLenBytes5);
      out5.set(valData5);
    }
    
    dataView(memory0).setUint32(base + 12, len5, true);
    dataView(memory0).setUint32(base + 8, ptr5, true);
  }
  dataView(memory0).setUint32(arg1 + 4, len6, true);
  dataView(memory0).setUint32(arg1 + 0, result6, true);
  _debugLog('[iface="wasi:http/types@0.2.10", function="[method]fields.entries"][Instruction::Return]', {
    funcName: '[method]fields.entries',
    paramCount: 0,
    async: false,
    postReturn: false
  });
  task.resolve([ret]);
  task.exit();
}
_trampoline45.fnName = 'wasi:http/types@0.2.10#entries';

const _trampoline46 = function(arg0, arg1) {
  var handle1 = arg0;
  
  var rep2 = handleTable9[(handle1 << 1) + 1] & ~T_FLAG;
  var rsc0 = captureTable9.get(rep2);
  if (!rsc0) {
    rsc0 = Object.create(IncomingRequest.prototype);
    Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
    Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
  }
  
  curResourceBorrows.push(rsc0);
  _debugLog('[iface="wasi:http/types@0.2.10", function="[method]incoming-request.method"] [Instruction::CallInterface] (sync, @ enter)');
  const hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1,
      isAsync: false,
      entryFnName: 'method',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(
    0,
    _getGlobalCurrentTaskMeta(0)?.taskID,
    )?.task;
    
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  
  let ret;
  
  try {
    ret = _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => rsc0.method(),
    })
    ;
  } catch (err) {
    
    _debugLog('[Instruction::CallInterface] error during sync call', {
      taskID: task.id(),
      subtaskID: task.getParentSubtask()?.id(),
      err,
    });
    task.setErrored(err);
    task.reject(err);
    task.exit();
    throw err;
    
  }
  
  for (const rsc of curResourceBorrows) {
    rsc[symbolRscHandle] = undefined;
  }
  curResourceBorrows = [];
  var variant4 = ret;
  switch (variant4.tag) {
    case 'get': {
      dataView(memory0).setInt8(arg1 + 0, 0, true);
      break;
    }
    case 'head': {
      dataView(memory0).setInt8(arg1 + 0, 1, true);
      break;
    }
    case 'post': {
      dataView(memory0).setInt8(arg1 + 0, 2, true);
      break;
    }
    case 'put': {
      dataView(memory0).setInt8(arg1 + 0, 3, true);
      break;
    }
    case 'delete': {
      dataView(memory0).setInt8(arg1 + 0, 4, true);
      break;
    }
    case 'connect': {
      dataView(memory0).setInt8(arg1 + 0, 5, true);
      break;
    }
    case 'options': {
      dataView(memory0).setInt8(arg1 + 0, 6, true);
      break;
    }
    case 'trace': {
      dataView(memory0).setInt8(arg1 + 0, 7, true);
      break;
    }
    case 'patch': {
      dataView(memory0).setInt8(arg1 + 0, 8, true);
      break;
    }
    case 'other': {
      const e = variant4.val;
      dataView(memory0).setInt8(arg1 + 0, 9, true);
      
      var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
      var ptr3= encodeRes.ptr;
      var len3 = encodeRes.len;
      
      dataView(memory0).setUint32(arg1 + 8, len3, true);
      dataView(memory0).setUint32(arg1 + 4, ptr3, true);
      break;
    }
    default: {
      throw new TypeError(`invalid variant tag value \`${JSON.stringify(variant4.tag)}\` (received \`${variant4}\`) specified for \`Method\``);
    }
  }
  _debugLog('[iface="wasi:http/types@0.2.10", function="[method]incoming-request.method"][Instruction::Return]', {
    funcName: '[method]incoming-request.method',
    paramCount: 0,
    async: false,
    postReturn: false
  });
  task.resolve([ret]);
  task.exit();
}
_trampoline46.fnName = 'wasi:http/types@0.2.10#method';

const _trampoline47 = function(arg0, arg1) {
  var handle1 = arg0;
  
  var rep2 = handleTable9[(handle1 << 1) + 1] & ~T_FLAG;
  var rsc0 = captureTable9.get(rep2);
  if (!rsc0) {
    rsc0 = Object.create(IncomingRequest.prototype);
    Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
    Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
  }
  
  curResourceBorrows.push(rsc0);
  _debugLog('[iface="wasi:http/types@0.2.10", function="[method]incoming-request.path-with-query"] [Instruction::CallInterface] (sync, @ enter)');
  const hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1,
      isAsync: false,
      entryFnName: 'pathWithQuery',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(
    0,
    _getGlobalCurrentTaskMeta(0)?.taskID,
    )?.task;
    
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  
  let ret;
  
  try {
    ret = _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => rsc0.pathWithQuery(),
    })
    ;
  } catch (err) {
    
    _debugLog('[Instruction::CallInterface] error during sync call', {
      taskID: task.id(),
      subtaskID: task.getParentSubtask()?.id(),
      err,
    });
    task.setErrored(err);
    task.reject(err);
    task.exit();
    throw err;
    
  }
  
  for (const rsc of curResourceBorrows) {
    rsc[symbolRscHandle] = undefined;
  }
  curResourceBorrows = [];
  var variant4 = ret;
  if (variant4 === null || variant4=== undefined) {
    dataView(memory0).setInt8(arg1 + 0, 0, true);
  } else {
    const e = variant4;
    dataView(memory0).setInt8(arg1 + 0, 1, true);
    
    var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
    var ptr3= encodeRes.ptr;
    var len3 = encodeRes.len;
    
    dataView(memory0).setUint32(arg1 + 8, len3, true);
    dataView(memory0).setUint32(arg1 + 4, ptr3, true);
  }
  _debugLog('[iface="wasi:http/types@0.2.10", function="[method]incoming-request.path-with-query"][Instruction::Return]', {
    funcName: '[method]incoming-request.path-with-query',
    paramCount: 0,
    async: false,
    postReturn: false
  });
  task.resolve([ret]);
  task.exit();
}
_trampoline47.fnName = 'wasi:http/types@0.2.10#pathWithQuery';

const _trampoline48 = function(arg0, arg1) {
  var handle1 = arg0;
  
  var rep2 = handleTable9[(handle1 << 1) + 1] & ~T_FLAG;
  var rsc0 = captureTable9.get(rep2);
  if (!rsc0) {
    rsc0 = Object.create(IncomingRequest.prototype);
    Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
    Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
  }
  
  curResourceBorrows.push(rsc0);
  _debugLog('[iface="wasi:http/types@0.2.10", function="[method]incoming-request.scheme"] [Instruction::CallInterface] (sync, @ enter)');
  const hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1,
      isAsync: false,
      entryFnName: 'scheme',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(
    0,
    _getGlobalCurrentTaskMeta(0)?.taskID,
    )?.task;
    
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  
  let ret;
  
  try {
    ret = _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => rsc0.scheme(),
    })
    ;
  } catch (err) {
    
    _debugLog('[Instruction::CallInterface] error during sync call', {
      taskID: task.id(),
      subtaskID: task.getParentSubtask()?.id(),
      err,
    });
    task.setErrored(err);
    task.reject(err);
    task.exit();
    throw err;
    
  }
  
  for (const rsc of curResourceBorrows) {
    rsc[symbolRscHandle] = undefined;
  }
  curResourceBorrows = [];
  var variant5 = ret;
  if (variant5 === null || variant5=== undefined) {
    dataView(memory0).setInt8(arg1 + 0, 0, true);
  } else {
    const e = variant5;
    dataView(memory0).setInt8(arg1 + 0, 1, true);
    var variant4 = e;
    switch (variant4.tag) {
      case 'HTTP': {
        dataView(memory0).setInt8(arg1 + 4, 0, true);
        break;
      }
      case 'HTTPS': {
        dataView(memory0).setInt8(arg1 + 4, 1, true);
        break;
      }
      case 'other': {
        const e = variant4.val;
        dataView(memory0).setInt8(arg1 + 4, 2, true);
        
        var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
        var ptr3= encodeRes.ptr;
        var len3 = encodeRes.len;
        
        dataView(memory0).setUint32(arg1 + 12, len3, true);
        dataView(memory0).setUint32(arg1 + 8, ptr3, true);
        break;
      }
      default: {
        throw new TypeError(`invalid variant tag value \`${JSON.stringify(variant4.tag)}\` (received \`${variant4}\`) specified for \`Scheme\``);
      }
    }
  }
  _debugLog('[iface="wasi:http/types@0.2.10", function="[method]incoming-request.scheme"][Instruction::Return]', {
    funcName: '[method]incoming-request.scheme',
    paramCount: 0,
    async: false,
    postReturn: false
  });
  task.resolve([ret]);
  task.exit();
}
_trampoline48.fnName = 'wasi:http/types@0.2.10#scheme';

const _trampoline49 = function(arg0, arg1) {
  var handle1 = arg0;
  
  var rep2 = handleTable9[(handle1 << 1) + 1] & ~T_FLAG;
  var rsc0 = captureTable9.get(rep2);
  if (!rsc0) {
    rsc0 = Object.create(IncomingRequest.prototype);
    Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
    Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
  }
  
  curResourceBorrows.push(rsc0);
  _debugLog('[iface="wasi:http/types@0.2.10", function="[method]incoming-request.authority"] [Instruction::CallInterface] (sync, @ enter)');
  const hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1,
      isAsync: false,
      entryFnName: 'authority',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(
    0,
    _getGlobalCurrentTaskMeta(0)?.taskID,
    )?.task;
    
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  
  let ret;
  
  try {
    ret = _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => rsc0.authority(),
    })
    ;
  } catch (err) {
    
    _debugLog('[Instruction::CallInterface] error during sync call', {
      taskID: task.id(),
      subtaskID: task.getParentSubtask()?.id(),
      err,
    });
    task.setErrored(err);
    task.reject(err);
    task.exit();
    throw err;
    
  }
  
  for (const rsc of curResourceBorrows) {
    rsc[symbolRscHandle] = undefined;
  }
  curResourceBorrows = [];
  var variant4 = ret;
  if (variant4 === null || variant4=== undefined) {
    dataView(memory0).setInt8(arg1 + 0, 0, true);
  } else {
    const e = variant4;
    dataView(memory0).setInt8(arg1 + 0, 1, true);
    
    var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
    var ptr3= encodeRes.ptr;
    var len3 = encodeRes.len;
    
    dataView(memory0).setUint32(arg1 + 8, len3, true);
    dataView(memory0).setUint32(arg1 + 4, ptr3, true);
  }
  _debugLog('[iface="wasi:http/types@0.2.10", function="[method]incoming-request.authority"][Instruction::Return]', {
    funcName: '[method]incoming-request.authority',
    paramCount: 0,
    async: false,
    postReturn: false
  });
  task.resolve([ret]);
  task.exit();
}
_trampoline49.fnName = 'wasi:http/types@0.2.10#authority';

const handleTable10 = [T_FLAG, 0];
handleTable10._createdReps = new Set();


const captureTable10= new Map();
let captureCnt10= 0;

HANDLE_TABLES[10] = handleTable10;

const _trampoline50 = function(arg0, arg1) {
  var handle1 = arg0;
  
  var rep2 = handleTable9[(handle1 << 1) + 1] & ~T_FLAG;
  var rsc0 = captureTable9.get(rep2);
  if (!rsc0) {
    rsc0 = Object.create(IncomingRequest.prototype);
    Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
    Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
  }
  
  curResourceBorrows.push(rsc0);
  _debugLog('[iface="wasi:http/types@0.2.10", function="[method]incoming-request.consume"] [Instruction::CallInterface] (sync, @ enter)');
  const hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1,
      isAsync: false,
      entryFnName: 'consume',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'result-catch-handler',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(
    0,
    _getGlobalCurrentTaskMeta(0)?.taskID,
    )?.task;
    
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  
  let ret;
  try {
    ret = { tag: 'ok', val: _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => rsc0.consume(),
    })
  };
} catch (e) {
  ret = { tag: 'err', val: getErrorPayload(e) };
}

for (const rsc of curResourceBorrows) {
  rsc[symbolRscHandle] = undefined;
}
curResourceBorrows = [];
var variant4 = ret;
switch (variant4.tag) {
  case 'ok': {
    const e = variant4.val;
    dataView(memory0).setInt8(arg1 + 0, 0, true);
    
    if (!(e instanceof IncomingBody)) {
      throw new TypeError('Resource error: Not a valid \"IncomingBody\" resource.');
    }
    var handle3 = e[symbolRscHandle];
    if (!handle3) {
      const rep = e[symbolRscRep] || ++captureCnt10;
      captureTable10.set(rep, e);
      handle3 = rscTableCreateOwn(handleTable10, rep);
    }
    
    dataView(memory0).setInt32(arg1 + 4, handle3, true);
    
    break;
  }
  case 'err': {
    const e = variant4.val;
    dataView(memory0).setInt8(arg1 + 0, 1, true);
    
    break;
  }
  default: {
    _debugLog("ERROR: invalid value (expected result as object with 'tag' member)", { value: variant4, valueType: typeof variant4});
    throw new TypeError('invalid variant specified for result');
  }
}
_debugLog('[iface="wasi:http/types@0.2.10", function="[method]incoming-request.consume"][Instruction::Return]', {
  funcName: '[method]incoming-request.consume',
  paramCount: 0,
  async: false,
  postReturn: false
});
task.resolve([ret]);
task.exit();
}
_trampoline50.fnName = 'wasi:http/types@0.2.10#consume';

const handleTable12 = [T_FLAG, 0];
handleTable12._createdReps = new Set();


const captureTable12= new Map();
let captureCnt12= 0;

HANDLE_TABLES[12] = handleTable12;

const _trampoline51 = function(arg0, arg1) {
  var handle1 = arg0;
  
  var rep2 = handleTable11[(handle1 << 1) + 1] & ~T_FLAG;
  var rsc0 = captureTable11.get(rep2);
  if (!rsc0) {
    rsc0 = Object.create(OutgoingRequest.prototype);
    Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
    Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
  }
  
  curResourceBorrows.push(rsc0);
  _debugLog('[iface="wasi:http/types@0.2.10", function="[method]outgoing-request.body"] [Instruction::CallInterface] (sync, @ enter)');
  const hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1,
      isAsync: false,
      entryFnName: 'body',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'result-catch-handler',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(
    0,
    _getGlobalCurrentTaskMeta(0)?.taskID,
    )?.task;
    
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  
  let ret;
  try {
    ret = { tag: 'ok', val: _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => rsc0.body(),
    })
  };
} catch (e) {
  ret = { tag: 'err', val: getErrorPayload(e) };
}

for (const rsc of curResourceBorrows) {
  rsc[symbolRscHandle] = undefined;
}
curResourceBorrows = [];
var variant4 = ret;
switch (variant4.tag) {
  case 'ok': {
    const e = variant4.val;
    dataView(memory0).setInt8(arg1 + 0, 0, true);
    
    if (!(e instanceof OutgoingBody)) {
      throw new TypeError('Resource error: Not a valid \"OutgoingBody\" resource.');
    }
    var handle3 = e[symbolRscHandle];
    if (!handle3) {
      const rep = e[symbolRscRep] || ++captureCnt12;
      captureTable12.set(rep, e);
      handle3 = rscTableCreateOwn(handleTable12, rep);
    }
    
    dataView(memory0).setInt32(arg1 + 4, handle3, true);
    
    break;
  }
  case 'err': {
    const e = variant4.val;
    dataView(memory0).setInt8(arg1 + 0, 1, true);
    
    break;
  }
  default: {
    _debugLog("ERROR: invalid value (expected result as object with 'tag' member)", { value: variant4, valueType: typeof variant4});
    throw new TypeError('invalid variant specified for result');
  }
}
_debugLog('[iface="wasi:http/types@0.2.10", function="[method]outgoing-request.body"][Instruction::Return]', {
  funcName: '[method]outgoing-request.body',
  paramCount: 0,
  async: false,
  postReturn: false
});
task.resolve([ret]);
task.exit();
}
_trampoline51.fnName = 'wasi:http/types@0.2.10#body';

const _trampoline52 = function(arg0, arg1, arg2, arg3) {
  var handle1 = arg0;
  
  var rep2 = handleTable11[(handle1 << 1) + 1] & ~T_FLAG;
  var rsc0 = captureTable11.get(rep2);
  if (!rsc0) {
    rsc0 = Object.create(OutgoingRequest.prototype);
    Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
    Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
  }
  
  curResourceBorrows.push(rsc0);
  let variant4;
  switch (arg1) {
    case 0: {
      variant4= {
        tag: 'get',
      };
      break;
    }
    case 1: {
      variant4= {
        tag: 'head',
      };
      break;
    }
    case 2: {
      variant4= {
        tag: 'post',
      };
      break;
    }
    case 3: {
      variant4= {
        tag: 'put',
      };
      break;
    }
    case 4: {
      variant4= {
        tag: 'delete',
      };
      break;
    }
    case 5: {
      variant4= {
        tag: 'connect',
      };
      break;
    }
    case 6: {
      variant4= {
        tag: 'options',
      };
      break;
    }
    case 7: {
      variant4= {
        tag: 'trace',
      };
      break;
    }
    case 8: {
      variant4= {
        tag: 'patch',
      };
      break;
    }
    case 9: {
      var ptr3 = arg2;
      var len3 = arg3;
      var result3 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr3, len3));
      variant4= {
        tag: 'other',
        val: result3
      };
      break;
    }
    default: {
      throw new TypeError('invalid variant discriminant for Method');
    }
  }
  _debugLog('[iface="wasi:http/types@0.2.10", function="[method]outgoing-request.set-method"] [Instruction::CallInterface] (sync, @ enter)');
  const hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1,
      isAsync: false,
      entryFnName: 'setMethod',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'result-catch-handler',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(
    0,
    _getGlobalCurrentTaskMeta(0)?.taskID,
    )?.task;
    
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  
  let ret;
  try {
    ret = { tag: 'ok', val: _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => rsc0.setMethod(variant4),
    })
  };
} catch (e) {
  ret = { tag: 'err', val: getErrorPayload(e) };
}

for (const rsc of curResourceBorrows) {
  rsc[symbolRscHandle] = undefined;
}
curResourceBorrows = [];
var variant5 = ret;
let variant5_0;
switch (variant5.tag) {
  case 'ok': {
    const e = variant5.val;
    variant5_0 = 0;
    
    break;
  }
  case 'err': {
    const e = variant5.val;
    variant5_0 = 1;
    
    break;
  }
  default: {
    _debugLog("ERROR: invalid value (expected result as object with 'tag' member)", { value: variant5, valueType: typeof variant5});
    throw new TypeError('invalid variant specified for result');
  }
}
_debugLog('[iface="wasi:http/types@0.2.10", function="[method]outgoing-request.set-method"][Instruction::Return]', {
  funcName: '[method]outgoing-request.set-method',
  paramCount: 1,
  async: false,
  postReturn: false
});
task.resolve([variant5_0]);
task.exit();
return variant5_0;
}
_trampoline52.fnName = 'wasi:http/types@0.2.10#setMethod';

const _trampoline53 = function(arg0, arg1, arg2, arg3) {
  var handle1 = arg0;
  
  var rep2 = handleTable11[(handle1 << 1) + 1] & ~T_FLAG;
  var rsc0 = captureTable11.get(rep2);
  if (!rsc0) {
    rsc0 = Object.create(OutgoingRequest.prototype);
    Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
    Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
  }
  
  curResourceBorrows.push(rsc0);
  let variant4;
  switch (arg1) {
    case 0: {
      variant4 = undefined;
      break;
    }
    case 1: {
      var ptr3 = arg2;
      var len3 = arg3;
      var result3 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr3, len3));
      variant4 = result3;
      break;
    }
    default: {
      throw new TypeError('invalid variant discriminant for option');
    }
  }
  _debugLog('[iface="wasi:http/types@0.2.10", function="[method]outgoing-request.set-path-with-query"] [Instruction::CallInterface] (sync, @ enter)');
  const hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1,
      isAsync: false,
      entryFnName: 'setPathWithQuery',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'result-catch-handler',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(
    0,
    _getGlobalCurrentTaskMeta(0)?.taskID,
    )?.task;
    
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  
  let ret;
  try {
    ret = { tag: 'ok', val: _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => rsc0.setPathWithQuery(variant4),
    })
  };
} catch (e) {
  ret = { tag: 'err', val: getErrorPayload(e) };
}

for (const rsc of curResourceBorrows) {
  rsc[symbolRscHandle] = undefined;
}
curResourceBorrows = [];
var variant5 = ret;
let variant5_0;
switch (variant5.tag) {
  case 'ok': {
    const e = variant5.val;
    variant5_0 = 0;
    
    break;
  }
  case 'err': {
    const e = variant5.val;
    variant5_0 = 1;
    
    break;
  }
  default: {
    _debugLog("ERROR: invalid value (expected result as object with 'tag' member)", { value: variant5, valueType: typeof variant5});
    throw new TypeError('invalid variant specified for result');
  }
}
_debugLog('[iface="wasi:http/types@0.2.10", function="[method]outgoing-request.set-path-with-query"][Instruction::Return]', {
  funcName: '[method]outgoing-request.set-path-with-query',
  paramCount: 1,
  async: false,
  postReturn: false
});
task.resolve([variant5_0]);
task.exit();
return variant5_0;
}
_trampoline53.fnName = 'wasi:http/types@0.2.10#setPathWithQuery';

const _trampoline54 = function(arg0, arg1, arg2, arg3, arg4) {
  var handle1 = arg0;
  
  var rep2 = handleTable11[(handle1 << 1) + 1] & ~T_FLAG;
  var rsc0 = captureTable11.get(rep2);
  if (!rsc0) {
    rsc0 = Object.create(OutgoingRequest.prototype);
    Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
    Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
  }
  
  curResourceBorrows.push(rsc0);
  let variant5;
  switch (arg1) {
    case 0: {
      variant5 = undefined;
      break;
    }
    case 1: {
      let variant4;
      switch (arg2) {
        case 0: {
          variant4= {
            tag: 'HTTP',
          };
          break;
        }
        case 1: {
          variant4= {
            tag: 'HTTPS',
          };
          break;
        }
        case 2: {
          var ptr3 = arg3;
          var len3 = arg4;
          var result3 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr3, len3));
          variant4= {
            tag: 'other',
            val: result3
          };
          break;
        }
        default: {
          throw new TypeError('invalid variant discriminant for Scheme');
        }
      }
      variant5 = variant4;
      break;
    }
    default: {
      throw new TypeError('invalid variant discriminant for option');
    }
  }
  _debugLog('[iface="wasi:http/types@0.2.10", function="[method]outgoing-request.set-scheme"] [Instruction::CallInterface] (sync, @ enter)');
  const hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1,
      isAsync: false,
      entryFnName: 'setScheme',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'result-catch-handler',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(
    0,
    _getGlobalCurrentTaskMeta(0)?.taskID,
    )?.task;
    
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  
  let ret;
  try {
    ret = { tag: 'ok', val: _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => rsc0.setScheme(variant5),
    })
  };
} catch (e) {
  ret = { tag: 'err', val: getErrorPayload(e) };
}

for (const rsc of curResourceBorrows) {
  rsc[symbolRscHandle] = undefined;
}
curResourceBorrows = [];
var variant6 = ret;
let variant6_0;
switch (variant6.tag) {
  case 'ok': {
    const e = variant6.val;
    variant6_0 = 0;
    
    break;
  }
  case 'err': {
    const e = variant6.val;
    variant6_0 = 1;
    
    break;
  }
  default: {
    _debugLog("ERROR: invalid value (expected result as object with 'tag' member)", { value: variant6, valueType: typeof variant6});
    throw new TypeError('invalid variant specified for result');
  }
}
_debugLog('[iface="wasi:http/types@0.2.10", function="[method]outgoing-request.set-scheme"][Instruction::Return]', {
  funcName: '[method]outgoing-request.set-scheme',
  paramCount: 1,
  async: false,
  postReturn: false
});
task.resolve([variant6_0]);
task.exit();
return variant6_0;
}
_trampoline54.fnName = 'wasi:http/types@0.2.10#setScheme';

const _trampoline55 = function(arg0, arg1, arg2, arg3) {
  var handle1 = arg0;
  
  var rep2 = handleTable11[(handle1 << 1) + 1] & ~T_FLAG;
  var rsc0 = captureTable11.get(rep2);
  if (!rsc0) {
    rsc0 = Object.create(OutgoingRequest.prototype);
    Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
    Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
  }
  
  curResourceBorrows.push(rsc0);
  let variant4;
  switch (arg1) {
    case 0: {
      variant4 = undefined;
      break;
    }
    case 1: {
      var ptr3 = arg2;
      var len3 = arg3;
      var result3 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr3, len3));
      variant4 = result3;
      break;
    }
    default: {
      throw new TypeError('invalid variant discriminant for option');
    }
  }
  _debugLog('[iface="wasi:http/types@0.2.10", function="[method]outgoing-request.set-authority"] [Instruction::CallInterface] (sync, @ enter)');
  const hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1,
      isAsync: false,
      entryFnName: 'setAuthority',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'result-catch-handler',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(
    0,
    _getGlobalCurrentTaskMeta(0)?.taskID,
    )?.task;
    
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  
  let ret;
  try {
    ret = { tag: 'ok', val: _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => rsc0.setAuthority(variant4),
    })
  };
} catch (e) {
  ret = { tag: 'err', val: getErrorPayload(e) };
}

for (const rsc of curResourceBorrows) {
  rsc[symbolRscHandle] = undefined;
}
curResourceBorrows = [];
var variant5 = ret;
let variant5_0;
switch (variant5.tag) {
  case 'ok': {
    const e = variant5.val;
    variant5_0 = 0;
    
    break;
  }
  case 'err': {
    const e = variant5.val;
    variant5_0 = 1;
    
    break;
  }
  default: {
    _debugLog("ERROR: invalid value (expected result as object with 'tag' member)", { value: variant5, valueType: typeof variant5});
    throw new TypeError('invalid variant specified for result');
  }
}
_debugLog('[iface="wasi:http/types@0.2.10", function="[method]outgoing-request.set-authority"][Instruction::Return]', {
  funcName: '[method]outgoing-request.set-authority',
  paramCount: 1,
  async: false,
  postReturn: false
});
task.resolve([variant5_0]);
task.exit();
return variant5_0;
}
_trampoline55.fnName = 'wasi:http/types@0.2.10#setAuthority';

const handleTable13 = [T_FLAG, 0];
handleTable13._createdReps = new Set();


const captureTable13= new Map();
let captureCnt13= 0;

HANDLE_TABLES[13] = handleTable13;

const _trampoline56 = function(arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8) {
  var handle1 = arg0;
  
  var rep2 = handleTable13[(handle1 << 1) + 1] & ~T_FLAG;
  var rsc0 = captureTable13.get(rep2);
  if (!rsc0) {
    rsc0 = Object.create(ResponseOutparam.prototype);
    Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
    Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
  }
  
  else {
    captureTable13.delete(rep2);
  }
  rscTableRemove(handleTable13, handle1);
  let variant38;
  switch (arg1) {
    case 0: {
      var handle4 = arg2;
      
      var rep5 = handleTable14[(handle4 << 1) + 1] & ~T_FLAG;
      var rsc3 = captureTable14.get(rep5);
      if (!rsc3) {
        rsc3 = Object.create(OutgoingResponse.prototype);
        Object.defineProperty(rsc3, symbolRscHandle, { writable: true, value: handle4});
        Object.defineProperty(rsc3, symbolRscRep, { writable: true, value: rep5});
      }
      
      else {
        captureTable14.delete(rep5);
      }
      rscTableRemove(handleTable14, handle4);
      variant38= {
        tag: 'ok',
        val: rsc3
      };
      break;
    }
    case 1: {
      let variant37;
      switch (arg2) {
        case 0: {
          variant37= {
            tag: 'DNS-timeout',
          };
          break;
        }
        case 1: {
          let variant7;
          switch (arg3) {
            case 0: {
              variant7 = undefined;
              break;
            }
            case 1: {
              var ptr6 = Number(arg4);
              var len6 = arg5;
              var result6 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr6, len6));
              variant7 = result6;
              break;
            }
            default: {
              throw new TypeError('invalid variant discriminant for option');
            }
          }
          let variant8;
          switch (arg6) {
            case 0: {
              variant8 = undefined;
              break;
            }
            case 1: {
              variant8 = clampGuest(arg7, 0, 65535);
              break;
            }
            default: {
              throw new TypeError('invalid variant discriminant for option');
            }
          }
          variant37= {
            tag: 'DNS-error',
            val: {
              rcode: variant7,
              infoCode: variant8,
            }
          };
          break;
        }
        case 2: {
          variant37= {
            tag: 'destination-not-found',
          };
          break;
        }
        case 3: {
          variant37= {
            tag: 'destination-unavailable',
          };
          break;
        }
        case 4: {
          variant37= {
            tag: 'destination-IP-prohibited',
          };
          break;
        }
        case 5: {
          variant37= {
            tag: 'destination-IP-unroutable',
          };
          break;
        }
        case 6: {
          variant37= {
            tag: 'connection-refused',
          };
          break;
        }
        case 7: {
          variant37= {
            tag: 'connection-terminated',
          };
          break;
        }
        case 8: {
          variant37= {
            tag: 'connection-timeout',
          };
          break;
        }
        case 9: {
          variant37= {
            tag: 'connection-read-timeout',
          };
          break;
        }
        case 10: {
          variant37= {
            tag: 'connection-write-timeout',
          };
          break;
        }
        case 11: {
          variant37= {
            tag: 'connection-limit-reached',
          };
          break;
        }
        case 12: {
          variant37= {
            tag: 'TLS-protocol-error',
          };
          break;
        }
        case 13: {
          variant37= {
            tag: 'TLS-certificate-error',
          };
          break;
        }
        case 14: {
          let variant9;
          switch (arg3) {
            case 0: {
              variant9 = undefined;
              break;
            }
            case 1: {
              variant9 = clampGuest(Number(arg4), 0, 255);
              break;
            }
            default: {
              throw new TypeError('invalid variant discriminant for option');
            }
          }
          let variant11;
          switch (arg5) {
            case 0: {
              variant11 = undefined;
              break;
            }
            case 1: {
              var ptr10 = arg6;
              var len10 = arg7;
              var result10 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr10, len10));
              variant11 = result10;
              break;
            }
            default: {
              throw new TypeError('invalid variant discriminant for option');
            }
          }
          variant37= {
            tag: 'TLS-alert-received',
            val: {
              alertId: variant9,
              alertMessage: variant11,
            }
          };
          break;
        }
        case 15: {
          variant37= {
            tag: 'HTTP-request-denied',
          };
          break;
        }
        case 16: {
          variant37= {
            tag: 'HTTP-request-length-required',
          };
          break;
        }
        case 17: {
          let variant12;
          switch (arg3) {
            case 0: {
              variant12 = undefined;
              break;
            }
            case 1: {
              variant12 = BigInt.asUintN(64, BigInt(arg4));
              break;
            }
            default: {
              throw new TypeError('invalid variant discriminant for option');
            }
          }
          variant37= {
            tag: 'HTTP-request-body-size',
            val: variant12
          };
          break;
        }
        case 18: {
          variant37= {
            tag: 'HTTP-request-method-invalid',
          };
          break;
        }
        case 19: {
          variant37= {
            tag: 'HTTP-request-URI-invalid',
          };
          break;
        }
        case 20: {
          variant37= {
            tag: 'HTTP-request-URI-too-long',
          };
          break;
        }
        case 21: {
          let variant13;
          switch (arg3) {
            case 0: {
              variant13 = undefined;
              break;
            }
            case 1: {
              variant13 = Number(arg4) >>> 0;
              break;
            }
            default: {
              throw new TypeError('invalid variant discriminant for option');
            }
          }
          variant37= {
            tag: 'HTTP-request-header-section-size',
            val: variant13
          };
          break;
        }
        case 22: {
          let variant17;
          switch (arg3) {
            case 0: {
              variant17 = undefined;
              break;
            }
            case 1: {
              let variant15;
              switch (Number(arg4)) {
                case 0: {
                  variant15 = undefined;
                  break;
                }
                case 1: {
                  var ptr14 = arg5;
                  var len14 = arg6;
                  var result14 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr14, len14));
                  variant15 = result14;
                  break;
                }
                default: {
                  throw new TypeError('invalid variant discriminant for option');
                }
              }
              let variant16;
              switch (arg7) {
                case 0: {
                  variant16 = undefined;
                  break;
                }
                case 1: {
                  variant16 = arg8 >>> 0;
                  break;
                }
                default: {
                  throw new TypeError('invalid variant discriminant for option');
                }
              }
              variant17 = {
                fieldName: variant15,
                fieldSize: variant16,
              };
              break;
            }
            default: {
              throw new TypeError('invalid variant discriminant for option');
            }
          }
          variant37= {
            tag: 'HTTP-request-header-size',
            val: variant17
          };
          break;
        }
        case 23: {
          let variant18;
          switch (arg3) {
            case 0: {
              variant18 = undefined;
              break;
            }
            case 1: {
              variant18 = Number(arg4) >>> 0;
              break;
            }
            default: {
              throw new TypeError('invalid variant discriminant for option');
            }
          }
          variant37= {
            tag: 'HTTP-request-trailer-section-size',
            val: variant18
          };
          break;
        }
        case 24: {
          let variant20;
          switch (arg3) {
            case 0: {
              variant20 = undefined;
              break;
            }
            case 1: {
              var ptr19 = Number(arg4);
              var len19 = arg5;
              var result19 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr19, len19));
              variant20 = result19;
              break;
            }
            default: {
              throw new TypeError('invalid variant discriminant for option');
            }
          }
          let variant21;
          switch (arg6) {
            case 0: {
              variant21 = undefined;
              break;
            }
            case 1: {
              variant21 = arg7 >>> 0;
              break;
            }
            default: {
              throw new TypeError('invalid variant discriminant for option');
            }
          }
          variant37= {
            tag: 'HTTP-request-trailer-size',
            val: {
              fieldName: variant20,
              fieldSize: variant21,
            }
          };
          break;
        }
        case 25: {
          variant37= {
            tag: 'HTTP-response-incomplete',
          };
          break;
        }
        case 26: {
          let variant22;
          switch (arg3) {
            case 0: {
              variant22 = undefined;
              break;
            }
            case 1: {
              variant22 = Number(arg4) >>> 0;
              break;
            }
            default: {
              throw new TypeError('invalid variant discriminant for option');
            }
          }
          variant37= {
            tag: 'HTTP-response-header-section-size',
            val: variant22
          };
          break;
        }
        case 27: {
          let variant24;
          switch (arg3) {
            case 0: {
              variant24 = undefined;
              break;
            }
            case 1: {
              var ptr23 = Number(arg4);
              var len23 = arg5;
              var result23 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr23, len23));
              variant24 = result23;
              break;
            }
            default: {
              throw new TypeError('invalid variant discriminant for option');
            }
          }
          let variant25;
          switch (arg6) {
            case 0: {
              variant25 = undefined;
              break;
            }
            case 1: {
              variant25 = arg7 >>> 0;
              break;
            }
            default: {
              throw new TypeError('invalid variant discriminant for option');
            }
          }
          variant37= {
            tag: 'HTTP-response-header-size',
            val: {
              fieldName: variant24,
              fieldSize: variant25,
            }
          };
          break;
        }
        case 28: {
          let variant26;
          switch (arg3) {
            case 0: {
              variant26 = undefined;
              break;
            }
            case 1: {
              variant26 = BigInt.asUintN(64, BigInt(arg4));
              break;
            }
            default: {
              throw new TypeError('invalid variant discriminant for option');
            }
          }
          variant37= {
            tag: 'HTTP-response-body-size',
            val: variant26
          };
          break;
        }
        case 29: {
          let variant27;
          switch (arg3) {
            case 0: {
              variant27 = undefined;
              break;
            }
            case 1: {
              variant27 = Number(arg4) >>> 0;
              break;
            }
            default: {
              throw new TypeError('invalid variant discriminant for option');
            }
          }
          variant37= {
            tag: 'HTTP-response-trailer-section-size',
            val: variant27
          };
          break;
        }
        case 30: {
          let variant29;
          switch (arg3) {
            case 0: {
              variant29 = undefined;
              break;
            }
            case 1: {
              var ptr28 = Number(arg4);
              var len28 = arg5;
              var result28 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr28, len28));
              variant29 = result28;
              break;
            }
            default: {
              throw new TypeError('invalid variant discriminant for option');
            }
          }
          let variant30;
          switch (arg6) {
            case 0: {
              variant30 = undefined;
              break;
            }
            case 1: {
              variant30 = arg7 >>> 0;
              break;
            }
            default: {
              throw new TypeError('invalid variant discriminant for option');
            }
          }
          variant37= {
            tag: 'HTTP-response-trailer-size',
            val: {
              fieldName: variant29,
              fieldSize: variant30,
            }
          };
          break;
        }
        case 31: {
          let variant32;
          switch (arg3) {
            case 0: {
              variant32 = undefined;
              break;
            }
            case 1: {
              var ptr31 = Number(arg4);
              var len31 = arg5;
              var result31 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr31, len31));
              variant32 = result31;
              break;
            }
            default: {
              throw new TypeError('invalid variant discriminant for option');
            }
          }
          variant37= {
            tag: 'HTTP-response-transfer-coding',
            val: variant32
          };
          break;
        }
        case 32: {
          let variant34;
          switch (arg3) {
            case 0: {
              variant34 = undefined;
              break;
            }
            case 1: {
              var ptr33 = Number(arg4);
              var len33 = arg5;
              var result33 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr33, len33));
              variant34 = result33;
              break;
            }
            default: {
              throw new TypeError('invalid variant discriminant for option');
            }
          }
          variant37= {
            tag: 'HTTP-response-content-coding',
            val: variant34
          };
          break;
        }
        case 33: {
          variant37= {
            tag: 'HTTP-response-timeout',
          };
          break;
        }
        case 34: {
          variant37= {
            tag: 'HTTP-upgrade-failed',
          };
          break;
        }
        case 35: {
          variant37= {
            tag: 'HTTP-protocol-error',
          };
          break;
        }
        case 36: {
          variant37= {
            tag: 'loop-detected',
          };
          break;
        }
        case 37: {
          variant37= {
            tag: 'configuration-error',
          };
          break;
        }
        case 38: {
          let variant36;
          switch (arg3) {
            case 0: {
              variant36 = undefined;
              break;
            }
            case 1: {
              var ptr35 = Number(arg4);
              var len35 = arg5;
              var result35 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr35, len35));
              variant36 = result35;
              break;
            }
            default: {
              throw new TypeError('invalid variant discriminant for option');
            }
          }
          variant37= {
            tag: 'internal-error',
            val: variant36
          };
          break;
        }
        default: {
          throw new TypeError('invalid variant discriminant for ErrorCode');
        }
      }
      variant38= {
        tag: 'err',
        val: variant37
      };
      break;
    }
    default: {
      throw new TypeError('invalid variant discriminant for expected');
    }
  }
  _debugLog('[iface="wasi:http/types@0.2.10", function="[static]response-outparam.set"] [Instruction::CallInterface] (sync, @ enter)');
  const hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1,
      isAsync: false,
      entryFnName: 'ResponseOutparam.set',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(
    0,
    _getGlobalCurrentTaskMeta(0)?.taskID,
    )?.task;
    
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  
  let ret;
  
  try {
    _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => ResponseOutparam.set(rsc0, variant38),
    })
    ;
  } catch (err) {
    
    _debugLog('[Instruction::CallInterface] error during sync call', {
      taskID: task.id(),
      subtaskID: task.getParentSubtask()?.id(),
      err,
    });
    task.setErrored(err);
    task.reject(err);
    task.exit();
    throw err;
    
  }
  
  _debugLog('[iface="wasi:http/types@0.2.10", function="[static]response-outparam.set"][Instruction::Return]', {
    funcName: '[static]response-outparam.set',
    paramCount: 0,
    async: false,
    postReturn: false
  });
  task.resolve([ret]);
  task.exit();
}
_trampoline56.fnName = 'wasi:http/types@0.2.10#ResponseOutparam.set';

const _trampoline57 = function(arg0, arg1) {
  var handle1 = arg0;
  
  var rep2 = handleTable15[(handle1 << 1) + 1] & ~T_FLAG;
  var rsc0 = captureTable15.get(rep2);
  if (!rsc0) {
    rsc0 = Object.create(IncomingResponse.prototype);
    Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
    Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
  }
  
  curResourceBorrows.push(rsc0);
  _debugLog('[iface="wasi:http/types@0.2.10", function="[method]incoming-response.consume"] [Instruction::CallInterface] (sync, @ enter)');
  const hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1,
      isAsync: false,
      entryFnName: 'consume',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'result-catch-handler',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(
    0,
    _getGlobalCurrentTaskMeta(0)?.taskID,
    )?.task;
    
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  
  let ret;
  try {
    ret = { tag: 'ok', val: _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => rsc0.consume(),
    })
  };
} catch (e) {
  ret = { tag: 'err', val: getErrorPayload(e) };
}

for (const rsc of curResourceBorrows) {
  rsc[symbolRscHandle] = undefined;
}
curResourceBorrows = [];
var variant4 = ret;
switch (variant4.tag) {
  case 'ok': {
    const e = variant4.val;
    dataView(memory0).setInt8(arg1 + 0, 0, true);
    
    if (!(e instanceof IncomingBody)) {
      throw new TypeError('Resource error: Not a valid \"IncomingBody\" resource.');
    }
    var handle3 = e[symbolRscHandle];
    if (!handle3) {
      const rep = e[symbolRscRep] || ++captureCnt10;
      captureTable10.set(rep, e);
      handle3 = rscTableCreateOwn(handleTable10, rep);
    }
    
    dataView(memory0).setInt32(arg1 + 4, handle3, true);
    
    break;
  }
  case 'err': {
    const e = variant4.val;
    dataView(memory0).setInt8(arg1 + 0, 1, true);
    
    break;
  }
  default: {
    _debugLog("ERROR: invalid value (expected result as object with 'tag' member)", { value: variant4, valueType: typeof variant4});
    throw new TypeError('invalid variant specified for result');
  }
}
_debugLog('[iface="wasi:http/types@0.2.10", function="[method]incoming-response.consume"][Instruction::Return]', {
  funcName: '[method]incoming-response.consume',
  paramCount: 0,
  async: false,
  postReturn: false
});
task.resolve([ret]);
task.exit();
}
_trampoline57.fnName = 'wasi:http/types@0.2.10#consume';

const _trampoline58 = function(arg0, arg1) {
  var handle1 = arg0;
  
  var rep2 = handleTable10[(handle1 << 1) + 1] & ~T_FLAG;
  var rsc0 = captureTable10.get(rep2);
  if (!rsc0) {
    rsc0 = Object.create(IncomingBody.prototype);
    Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
    Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
  }
  
  curResourceBorrows.push(rsc0);
  _debugLog('[iface="wasi:http/types@0.2.10", function="[method]incoming-body.stream"] [Instruction::CallInterface] (sync, @ enter)');
  const hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1,
      isAsync: false,
      entryFnName: 'stream',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'result-catch-handler',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(
    0,
    _getGlobalCurrentTaskMeta(0)?.taskID,
    )?.task;
    
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  
  let ret;
  try {
    ret = { tag: 'ok', val: _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => rsc0.stream(),
    })
  };
} catch (e) {
  ret = { tag: 'err', val: getErrorPayload(e) };
}

for (const rsc of curResourceBorrows) {
  rsc[symbolRscHandle] = undefined;
}
curResourceBorrows = [];
var variant4 = ret;
switch (variant4.tag) {
  case 'ok': {
    const e = variant4.val;
    dataView(memory0).setInt8(arg1 + 0, 0, true);
    
    if (!(e instanceof InputStream)) {
      throw new TypeError('Resource error: Not a valid \"InputStream\" resource.');
    }
    var handle3 = e[symbolRscHandle];
    if (!handle3) {
      const rep = e[symbolRscRep] || ++captureCnt3;
      captureTable3.set(rep, e);
      handle3 = rscTableCreateOwn(handleTable3, rep);
    }
    
    dataView(memory0).setInt32(arg1 + 4, handle3, true);
    
    break;
  }
  case 'err': {
    const e = variant4.val;
    dataView(memory0).setInt8(arg1 + 0, 1, true);
    
    break;
  }
  default: {
    _debugLog("ERROR: invalid value (expected result as object with 'tag' member)", { value: variant4, valueType: typeof variant4});
    throw new TypeError('invalid variant specified for result');
  }
}
_debugLog('[iface="wasi:http/types@0.2.10", function="[method]incoming-body.stream"][Instruction::Return]', {
  funcName: '[method]incoming-body.stream',
  paramCount: 0,
  async: false,
  postReturn: false
});
task.resolve([ret]);
task.exit();
}
_trampoline58.fnName = 'wasi:http/types@0.2.10#stream';

const _trampoline59 = function(arg0, arg1) {
  var handle1 = arg0;
  
  var rep2 = handleTable14[(handle1 << 1) + 1] & ~T_FLAG;
  var rsc0 = captureTable14.get(rep2);
  if (!rsc0) {
    rsc0 = Object.create(OutgoingResponse.prototype);
    Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
    Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
  }
  
  curResourceBorrows.push(rsc0);
  _debugLog('[iface="wasi:http/types@0.2.10", function="[method]outgoing-response.body"] [Instruction::CallInterface] (sync, @ enter)');
  const hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1,
      isAsync: false,
      entryFnName: 'body',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'result-catch-handler',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(
    0,
    _getGlobalCurrentTaskMeta(0)?.taskID,
    )?.task;
    
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  
  let ret;
  try {
    ret = { tag: 'ok', val: _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => rsc0.body(),
    })
  };
} catch (e) {
  ret = { tag: 'err', val: getErrorPayload(e) };
}

for (const rsc of curResourceBorrows) {
  rsc[symbolRscHandle] = undefined;
}
curResourceBorrows = [];
var variant4 = ret;
switch (variant4.tag) {
  case 'ok': {
    const e = variant4.val;
    dataView(memory0).setInt8(arg1 + 0, 0, true);
    
    if (!(e instanceof OutgoingBody)) {
      throw new TypeError('Resource error: Not a valid \"OutgoingBody\" resource.');
    }
    var handle3 = e[symbolRscHandle];
    if (!handle3) {
      const rep = e[symbolRscRep] || ++captureCnt12;
      captureTable12.set(rep, e);
      handle3 = rscTableCreateOwn(handleTable12, rep);
    }
    
    dataView(memory0).setInt32(arg1 + 4, handle3, true);
    
    break;
  }
  case 'err': {
    const e = variant4.val;
    dataView(memory0).setInt8(arg1 + 0, 1, true);
    
    break;
  }
  default: {
    _debugLog("ERROR: invalid value (expected result as object with 'tag' member)", { value: variant4, valueType: typeof variant4});
    throw new TypeError('invalid variant specified for result');
  }
}
_debugLog('[iface="wasi:http/types@0.2.10", function="[method]outgoing-response.body"][Instruction::Return]', {
  funcName: '[method]outgoing-response.body',
  paramCount: 0,
  async: false,
  postReturn: false
});
task.resolve([ret]);
task.exit();
}
_trampoline59.fnName = 'wasi:http/types@0.2.10#body';

const _trampoline60 = function(arg0, arg1) {
  var handle1 = arg0;
  
  var rep2 = handleTable12[(handle1 << 1) + 1] & ~T_FLAG;
  var rsc0 = captureTable12.get(rep2);
  if (!rsc0) {
    rsc0 = Object.create(OutgoingBody.prototype);
    Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
    Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
  }
  
  curResourceBorrows.push(rsc0);
  _debugLog('[iface="wasi:http/types@0.2.10", function="[method]outgoing-body.write"] [Instruction::CallInterface] (sync, @ enter)');
  const hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1,
      isAsync: false,
      entryFnName: 'write',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'result-catch-handler',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(
    0,
    _getGlobalCurrentTaskMeta(0)?.taskID,
    )?.task;
    
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  
  let ret;
  try {
    ret = { tag: 'ok', val: _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => rsc0.write(),
    })
  };
} catch (e) {
  ret = { tag: 'err', val: getErrorPayload(e) };
}

for (const rsc of curResourceBorrows) {
  rsc[symbolRscHandle] = undefined;
}
curResourceBorrows = [];
var variant4 = ret;
switch (variant4.tag) {
  case 'ok': {
    const e = variant4.val;
    dataView(memory0).setInt8(arg1 + 0, 0, true);
    
    if (!(e instanceof OutputStream)) {
      throw new TypeError('Resource error: Not a valid \"OutputStream\" resource.');
    }
    var handle3 = e[symbolRscHandle];
    if (!handle3) {
      const rep = e[symbolRscRep] || ++captureCnt4;
      captureTable4.set(rep, e);
      handle3 = rscTableCreateOwn(handleTable4, rep);
    }
    
    dataView(memory0).setInt32(arg1 + 4, handle3, true);
    
    break;
  }
  case 'err': {
    const e = variant4.val;
    dataView(memory0).setInt8(arg1 + 0, 1, true);
    
    break;
  }
  default: {
    _debugLog("ERROR: invalid value (expected result as object with 'tag' member)", { value: variant4, valueType: typeof variant4});
    throw new TypeError('invalid variant specified for result');
  }
}
_debugLog('[iface="wasi:http/types@0.2.10", function="[method]outgoing-body.write"][Instruction::Return]', {
  funcName: '[method]outgoing-body.write',
  paramCount: 0,
  async: false,
  postReturn: false
});
task.resolve([ret]);
task.exit();
}
_trampoline60.fnName = 'wasi:http/types@0.2.10#write';

const _trampoline61 = function(arg0, arg1, arg2, arg3) {
  var handle1 = arg0;
  
  var rep2 = handleTable12[(handle1 << 1) + 1] & ~T_FLAG;
  var rsc0 = captureTable12.get(rep2);
  if (!rsc0) {
    rsc0 = Object.create(OutgoingBody.prototype);
    Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
    Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
  }
  
  else {
    captureTable12.delete(rep2);
  }
  rscTableRemove(handleTable12, handle1);
  let variant6;
  switch (arg1) {
    case 0: {
      variant6 = undefined;
      break;
    }
    case 1: {
      var handle4 = arg2;
      
      var rep5 = handleTable8[(handle4 << 1) + 1] & ~T_FLAG;
      var rsc3 = captureTable8.get(rep5);
      if (!rsc3) {
        rsc3 = Object.create(Fields.prototype);
        Object.defineProperty(rsc3, symbolRscHandle, { writable: true, value: handle4});
        Object.defineProperty(rsc3, symbolRscRep, { writable: true, value: rep5});
      }
      
      else {
        captureTable8.delete(rep5);
      }
      rscTableRemove(handleTable8, handle4);
      variant6 = rsc3;
      break;
    }
    default: {
      throw new TypeError('invalid variant discriminant for option');
    }
  }
  _debugLog('[iface="wasi:http/types@0.2.10", function="[static]outgoing-body.finish"] [Instruction::CallInterface] (sync, @ enter)');
  const hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1,
      isAsync: false,
      entryFnName: 'OutgoingBody.finish',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'result-catch-handler',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(
    0,
    _getGlobalCurrentTaskMeta(0)?.taskID,
    )?.task;
    
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  
  let ret;
  try {
    ret = { tag: 'ok', val: _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => OutgoingBody.finish(rsc0, variant6),
    })
  };
} catch (e) {
  ret = { tag: 'err', val: getErrorPayload(e) };
}

var variant45 = ret;
switch (variant45.tag) {
  case 'ok': {
    const e = variant45.val;
    dataView(memory0).setInt8(arg3 + 0, 0, true);
    
    break;
  }
  case 'err': {
    const e = variant45.val;
    dataView(memory0).setInt8(arg3 + 0, 1, true);
    var variant44 = e;
    switch (variant44.tag) {
      case 'DNS-timeout': {
        dataView(memory0).setInt8(arg3 + 8, 0, true);
        break;
      }
      case 'DNS-error': {
        const e = variant44.val;
        dataView(memory0).setInt8(arg3 + 8, 1, true);
        var {rcode: v7_0, infoCode: v7_1 } = e;
        var variant9 = v7_0;
        if (variant9 === null || variant9=== undefined) {
          dataView(memory0).setInt8(arg3 + 16, 0, true);
        } else {
          const e = variant9;
          dataView(memory0).setInt8(arg3 + 16, 1, true);
          
          var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
          var ptr8= encodeRes.ptr;
          var len8 = encodeRes.len;
          
          dataView(memory0).setUint32(arg3 + 24, len8, true);
          dataView(memory0).setUint32(arg3 + 20, ptr8, true);
        }
        var variant10 = v7_1;
        if (variant10 === null || variant10=== undefined) {
          dataView(memory0).setInt8(arg3 + 28, 0, true);
        } else {
          const e = variant10;
          dataView(memory0).setInt8(arg3 + 28, 1, true);
          dataView(memory0).setInt16(arg3 + 30, toUint16(e), true);
        }
        break;
      }
      case 'destination-not-found': {
        dataView(memory0).setInt8(arg3 + 8, 2, true);
        break;
      }
      case 'destination-unavailable': {
        dataView(memory0).setInt8(arg3 + 8, 3, true);
        break;
      }
      case 'destination-IP-prohibited': {
        dataView(memory0).setInt8(arg3 + 8, 4, true);
        break;
      }
      case 'destination-IP-unroutable': {
        dataView(memory0).setInt8(arg3 + 8, 5, true);
        break;
      }
      case 'connection-refused': {
        dataView(memory0).setInt8(arg3 + 8, 6, true);
        break;
      }
      case 'connection-terminated': {
        dataView(memory0).setInt8(arg3 + 8, 7, true);
        break;
      }
      case 'connection-timeout': {
        dataView(memory0).setInt8(arg3 + 8, 8, true);
        break;
      }
      case 'connection-read-timeout': {
        dataView(memory0).setInt8(arg3 + 8, 9, true);
        break;
      }
      case 'connection-write-timeout': {
        dataView(memory0).setInt8(arg3 + 8, 10, true);
        break;
      }
      case 'connection-limit-reached': {
        dataView(memory0).setInt8(arg3 + 8, 11, true);
        break;
      }
      case 'TLS-protocol-error': {
        dataView(memory0).setInt8(arg3 + 8, 12, true);
        break;
      }
      case 'TLS-certificate-error': {
        dataView(memory0).setInt8(arg3 + 8, 13, true);
        break;
      }
      case 'TLS-alert-received': {
        const e = variant44.val;
        dataView(memory0).setInt8(arg3 + 8, 14, true);
        var {alertId: v11_0, alertMessage: v11_1 } = e;
        var variant12 = v11_0;
        if (variant12 === null || variant12=== undefined) {
          dataView(memory0).setInt8(arg3 + 16, 0, true);
        } else {
          const e = variant12;
          dataView(memory0).setInt8(arg3 + 16, 1, true);
          dataView(memory0).setInt8(arg3 + 17, toUint8(e), true);
        }
        var variant14 = v11_1;
        if (variant14 === null || variant14=== undefined) {
          dataView(memory0).setInt8(arg3 + 20, 0, true);
        } else {
          const e = variant14;
          dataView(memory0).setInt8(arg3 + 20, 1, true);
          
          var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
          var ptr13= encodeRes.ptr;
          var len13 = encodeRes.len;
          
          dataView(memory0).setUint32(arg3 + 28, len13, true);
          dataView(memory0).setUint32(arg3 + 24, ptr13, true);
        }
        break;
      }
      case 'HTTP-request-denied': {
        dataView(memory0).setInt8(arg3 + 8, 15, true);
        break;
      }
      case 'HTTP-request-length-required': {
        dataView(memory0).setInt8(arg3 + 8, 16, true);
        break;
      }
      case 'HTTP-request-body-size': {
        const e = variant44.val;
        dataView(memory0).setInt8(arg3 + 8, 17, true);
        var variant15 = e;
        if (variant15 === null || variant15=== undefined) {
          dataView(memory0).setInt8(arg3 + 16, 0, true);
        } else {
          const e = variant15;
          dataView(memory0).setInt8(arg3 + 16, 1, true);
          dataView(memory0).setBigInt64(arg3 + 24, toUint64(e), true);
        }
        break;
      }
      case 'HTTP-request-method-invalid': {
        dataView(memory0).setInt8(arg3 + 8, 18, true);
        break;
      }
      case 'HTTP-request-URI-invalid': {
        dataView(memory0).setInt8(arg3 + 8, 19, true);
        break;
      }
      case 'HTTP-request-URI-too-long': {
        dataView(memory0).setInt8(arg3 + 8, 20, true);
        break;
      }
      case 'HTTP-request-header-section-size': {
        const e = variant44.val;
        dataView(memory0).setInt8(arg3 + 8, 21, true);
        var variant16 = e;
        if (variant16 === null || variant16=== undefined) {
          dataView(memory0).setInt8(arg3 + 16, 0, true);
        } else {
          const e = variant16;
          dataView(memory0).setInt8(arg3 + 16, 1, true);
          dataView(memory0).setInt32(arg3 + 20, toUint32(e), true);
        }
        break;
      }
      case 'HTTP-request-header-size': {
        const e = variant44.val;
        dataView(memory0).setInt8(arg3 + 8, 22, true);
        var variant21 = e;
        if (variant21 === null || variant21=== undefined) {
          dataView(memory0).setInt8(arg3 + 16, 0, true);
        } else {
          const e = variant21;
          dataView(memory0).setInt8(arg3 + 16, 1, true);
          var {fieldName: v17_0, fieldSize: v17_1 } = e;
          var variant19 = v17_0;
          if (variant19 === null || variant19=== undefined) {
            dataView(memory0).setInt8(arg3 + 20, 0, true);
          } else {
            const e = variant19;
            dataView(memory0).setInt8(arg3 + 20, 1, true);
            
            var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
            var ptr18= encodeRes.ptr;
            var len18 = encodeRes.len;
            
            dataView(memory0).setUint32(arg3 + 28, len18, true);
            dataView(memory0).setUint32(arg3 + 24, ptr18, true);
          }
          var variant20 = v17_1;
          if (variant20 === null || variant20=== undefined) {
            dataView(memory0).setInt8(arg3 + 32, 0, true);
          } else {
            const e = variant20;
            dataView(memory0).setInt8(arg3 + 32, 1, true);
            dataView(memory0).setInt32(arg3 + 36, toUint32(e), true);
          }
        }
        break;
      }
      case 'HTTP-request-trailer-section-size': {
        const e = variant44.val;
        dataView(memory0).setInt8(arg3 + 8, 23, true);
        var variant22 = e;
        if (variant22 === null || variant22=== undefined) {
          dataView(memory0).setInt8(arg3 + 16, 0, true);
        } else {
          const e = variant22;
          dataView(memory0).setInt8(arg3 + 16, 1, true);
          dataView(memory0).setInt32(arg3 + 20, toUint32(e), true);
        }
        break;
      }
      case 'HTTP-request-trailer-size': {
        const e = variant44.val;
        dataView(memory0).setInt8(arg3 + 8, 24, true);
        var {fieldName: v23_0, fieldSize: v23_1 } = e;
        var variant25 = v23_0;
        if (variant25 === null || variant25=== undefined) {
          dataView(memory0).setInt8(arg3 + 16, 0, true);
        } else {
          const e = variant25;
          dataView(memory0).setInt8(arg3 + 16, 1, true);
          
          var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
          var ptr24= encodeRes.ptr;
          var len24 = encodeRes.len;
          
          dataView(memory0).setUint32(arg3 + 24, len24, true);
          dataView(memory0).setUint32(arg3 + 20, ptr24, true);
        }
        var variant26 = v23_1;
        if (variant26 === null || variant26=== undefined) {
          dataView(memory0).setInt8(arg3 + 28, 0, true);
        } else {
          const e = variant26;
          dataView(memory0).setInt8(arg3 + 28, 1, true);
          dataView(memory0).setInt32(arg3 + 32, toUint32(e), true);
        }
        break;
      }
      case 'HTTP-response-incomplete': {
        dataView(memory0).setInt8(arg3 + 8, 25, true);
        break;
      }
      case 'HTTP-response-header-section-size': {
        const e = variant44.val;
        dataView(memory0).setInt8(arg3 + 8, 26, true);
        var variant27 = e;
        if (variant27 === null || variant27=== undefined) {
          dataView(memory0).setInt8(arg3 + 16, 0, true);
        } else {
          const e = variant27;
          dataView(memory0).setInt8(arg3 + 16, 1, true);
          dataView(memory0).setInt32(arg3 + 20, toUint32(e), true);
        }
        break;
      }
      case 'HTTP-response-header-size': {
        const e = variant44.val;
        dataView(memory0).setInt8(arg3 + 8, 27, true);
        var {fieldName: v28_0, fieldSize: v28_1 } = e;
        var variant30 = v28_0;
        if (variant30 === null || variant30=== undefined) {
          dataView(memory0).setInt8(arg3 + 16, 0, true);
        } else {
          const e = variant30;
          dataView(memory0).setInt8(arg3 + 16, 1, true);
          
          var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
          var ptr29= encodeRes.ptr;
          var len29 = encodeRes.len;
          
          dataView(memory0).setUint32(arg3 + 24, len29, true);
          dataView(memory0).setUint32(arg3 + 20, ptr29, true);
        }
        var variant31 = v28_1;
        if (variant31 === null || variant31=== undefined) {
          dataView(memory0).setInt8(arg3 + 28, 0, true);
        } else {
          const e = variant31;
          dataView(memory0).setInt8(arg3 + 28, 1, true);
          dataView(memory0).setInt32(arg3 + 32, toUint32(e), true);
        }
        break;
      }
      case 'HTTP-response-body-size': {
        const e = variant44.val;
        dataView(memory0).setInt8(arg3 + 8, 28, true);
        var variant32 = e;
        if (variant32 === null || variant32=== undefined) {
          dataView(memory0).setInt8(arg3 + 16, 0, true);
        } else {
          const e = variant32;
          dataView(memory0).setInt8(arg3 + 16, 1, true);
          dataView(memory0).setBigInt64(arg3 + 24, toUint64(e), true);
        }
        break;
      }
      case 'HTTP-response-trailer-section-size': {
        const e = variant44.val;
        dataView(memory0).setInt8(arg3 + 8, 29, true);
        var variant33 = e;
        if (variant33 === null || variant33=== undefined) {
          dataView(memory0).setInt8(arg3 + 16, 0, true);
        } else {
          const e = variant33;
          dataView(memory0).setInt8(arg3 + 16, 1, true);
          dataView(memory0).setInt32(arg3 + 20, toUint32(e), true);
        }
        break;
      }
      case 'HTTP-response-trailer-size': {
        const e = variant44.val;
        dataView(memory0).setInt8(arg3 + 8, 30, true);
        var {fieldName: v34_0, fieldSize: v34_1 } = e;
        var variant36 = v34_0;
        if (variant36 === null || variant36=== undefined) {
          dataView(memory0).setInt8(arg3 + 16, 0, true);
        } else {
          const e = variant36;
          dataView(memory0).setInt8(arg3 + 16, 1, true);
          
          var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
          var ptr35= encodeRes.ptr;
          var len35 = encodeRes.len;
          
          dataView(memory0).setUint32(arg3 + 24, len35, true);
          dataView(memory0).setUint32(arg3 + 20, ptr35, true);
        }
        var variant37 = v34_1;
        if (variant37 === null || variant37=== undefined) {
          dataView(memory0).setInt8(arg3 + 28, 0, true);
        } else {
          const e = variant37;
          dataView(memory0).setInt8(arg3 + 28, 1, true);
          dataView(memory0).setInt32(arg3 + 32, toUint32(e), true);
        }
        break;
      }
      case 'HTTP-response-transfer-coding': {
        const e = variant44.val;
        dataView(memory0).setInt8(arg3 + 8, 31, true);
        var variant39 = e;
        if (variant39 === null || variant39=== undefined) {
          dataView(memory0).setInt8(arg3 + 16, 0, true);
        } else {
          const e = variant39;
          dataView(memory0).setInt8(arg3 + 16, 1, true);
          
          var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
          var ptr38= encodeRes.ptr;
          var len38 = encodeRes.len;
          
          dataView(memory0).setUint32(arg3 + 24, len38, true);
          dataView(memory0).setUint32(arg3 + 20, ptr38, true);
        }
        break;
      }
      case 'HTTP-response-content-coding': {
        const e = variant44.val;
        dataView(memory0).setInt8(arg3 + 8, 32, true);
        var variant41 = e;
        if (variant41 === null || variant41=== undefined) {
          dataView(memory0).setInt8(arg3 + 16, 0, true);
        } else {
          const e = variant41;
          dataView(memory0).setInt8(arg3 + 16, 1, true);
          
          var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
          var ptr40= encodeRes.ptr;
          var len40 = encodeRes.len;
          
          dataView(memory0).setUint32(arg3 + 24, len40, true);
          dataView(memory0).setUint32(arg3 + 20, ptr40, true);
        }
        break;
      }
      case 'HTTP-response-timeout': {
        dataView(memory0).setInt8(arg3 + 8, 33, true);
        break;
      }
      case 'HTTP-upgrade-failed': {
        dataView(memory0).setInt8(arg3 + 8, 34, true);
        break;
      }
      case 'HTTP-protocol-error': {
        dataView(memory0).setInt8(arg3 + 8, 35, true);
        break;
      }
      case 'loop-detected': {
        dataView(memory0).setInt8(arg3 + 8, 36, true);
        break;
      }
      case 'configuration-error': {
        dataView(memory0).setInt8(arg3 + 8, 37, true);
        break;
      }
      case 'internal-error': {
        const e = variant44.val;
        dataView(memory0).setInt8(arg3 + 8, 38, true);
        var variant43 = e;
        if (variant43 === null || variant43=== undefined) {
          dataView(memory0).setInt8(arg3 + 16, 0, true);
        } else {
          const e = variant43;
          dataView(memory0).setInt8(arg3 + 16, 1, true);
          
          var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
          var ptr42= encodeRes.ptr;
          var len42 = encodeRes.len;
          
          dataView(memory0).setUint32(arg3 + 24, len42, true);
          dataView(memory0).setUint32(arg3 + 20, ptr42, true);
        }
        break;
      }
      default: {
        throw new TypeError(`invalid variant tag value \`${JSON.stringify(variant44.tag)}\` (received \`${variant44}\`) specified for \`ErrorCode\``);
      }
    }
    
    break;
  }
  default: {
    _debugLog("ERROR: invalid value (expected result as object with 'tag' member)", { value: variant45, valueType: typeof variant45});
    throw new TypeError('invalid variant specified for result');
  }
}
_debugLog('[iface="wasi:http/types@0.2.10", function="[static]outgoing-body.finish"][Instruction::Return]', {
  funcName: '[static]outgoing-body.finish',
  paramCount: 0,
  async: false,
  postReturn: false
});
task.resolve([ret]);
task.exit();
}
_trampoline61.fnName = 'wasi:http/types@0.2.10#OutgoingBody.finish';

const _trampoline62 = function(arg0, arg1) {
  var handle1 = arg0;
  
  var rep2 = handleTable16[(handle1 << 1) + 1] & ~T_FLAG;
  var rsc0 = captureTable16.get(rep2);
  if (!rsc0) {
    rsc0 = Object.create(FutureIncomingResponse.prototype);
    Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
    Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
  }
  
  curResourceBorrows.push(rsc0);
  _debugLog('[iface="wasi:http/types@0.2.10", function="[method]future-incoming-response.get"] [Instruction::CallInterface] (sync, @ enter)');
  const hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1,
      isAsync: false,
      entryFnName: 'get',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(
    0,
    _getGlobalCurrentTaskMeta(0)?.taskID,
    )?.task;
    
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  
  let ret;
  
  try {
    ret = _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => rsc0.get(),
    })
    ;
  } catch (err) {
    
    _debugLog('[Instruction::CallInterface] error during sync call', {
      taskID: task.id(),
      subtaskID: task.getParentSubtask()?.id(),
      err,
    });
    task.setErrored(err);
    task.reject(err);
    task.exit();
    throw err;
    
  }
  
  for (const rsc of curResourceBorrows) {
    rsc[symbolRscHandle] = undefined;
  }
  curResourceBorrows = [];
  var variant44 = ret;
  if (variant44 === null || variant44=== undefined) {
    dataView(memory0).setInt8(arg1 + 0, 0, true);
  } else {
    const e = variant44;
    dataView(memory0).setInt8(arg1 + 0, 1, true);
    var variant43 = e;
    switch (variant43.tag) {
      case 'ok': {
        const e = variant43.val;
        dataView(memory0).setInt8(arg1 + 8, 0, true);
        var variant42 = e;
        switch (variant42.tag) {
          case 'ok': {
            const e = variant42.val;
            dataView(memory0).setInt8(arg1 + 16, 0, true);
            
            if (!(e instanceof IncomingResponse)) {
              throw new TypeError('Resource error: Not a valid \"IncomingResponse\" resource.');
            }
            var handle3 = e[symbolRscHandle];
            if (!handle3) {
              const rep = e[symbolRscRep] || ++captureCnt15;
              captureTable15.set(rep, e);
              handle3 = rscTableCreateOwn(handleTable15, rep);
            }
            
            dataView(memory0).setInt32(arg1 + 24, handle3, true);
            
            break;
          }
          case 'err': {
            const e = variant42.val;
            dataView(memory0).setInt8(arg1 + 16, 1, true);
            var variant41 = e;
            switch (variant41.tag) {
              case 'DNS-timeout': {
                dataView(memory0).setInt8(arg1 + 24, 0, true);
                break;
              }
              case 'DNS-error': {
                const e = variant41.val;
                dataView(memory0).setInt8(arg1 + 24, 1, true);
                var {rcode: v4_0, infoCode: v4_1 } = e;
                var variant6 = v4_0;
                if (variant6 === null || variant6=== undefined) {
                  dataView(memory0).setInt8(arg1 + 32, 0, true);
                } else {
                  const e = variant6;
                  dataView(memory0).setInt8(arg1 + 32, 1, true);
                  
                  var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
                  var ptr5= encodeRes.ptr;
                  var len5 = encodeRes.len;
                  
                  dataView(memory0).setUint32(arg1 + 40, len5, true);
                  dataView(memory0).setUint32(arg1 + 36, ptr5, true);
                }
                var variant7 = v4_1;
                if (variant7 === null || variant7=== undefined) {
                  dataView(memory0).setInt8(arg1 + 44, 0, true);
                } else {
                  const e = variant7;
                  dataView(memory0).setInt8(arg1 + 44, 1, true);
                  dataView(memory0).setInt16(arg1 + 46, toUint16(e), true);
                }
                break;
              }
              case 'destination-not-found': {
                dataView(memory0).setInt8(arg1 + 24, 2, true);
                break;
              }
              case 'destination-unavailable': {
                dataView(memory0).setInt8(arg1 + 24, 3, true);
                break;
              }
              case 'destination-IP-prohibited': {
                dataView(memory0).setInt8(arg1 + 24, 4, true);
                break;
              }
              case 'destination-IP-unroutable': {
                dataView(memory0).setInt8(arg1 + 24, 5, true);
                break;
              }
              case 'connection-refused': {
                dataView(memory0).setInt8(arg1 + 24, 6, true);
                break;
              }
              case 'connection-terminated': {
                dataView(memory0).setInt8(arg1 + 24, 7, true);
                break;
              }
              case 'connection-timeout': {
                dataView(memory0).setInt8(arg1 + 24, 8, true);
                break;
              }
              case 'connection-read-timeout': {
                dataView(memory0).setInt8(arg1 + 24, 9, true);
                break;
              }
              case 'connection-write-timeout': {
                dataView(memory0).setInt8(arg1 + 24, 10, true);
                break;
              }
              case 'connection-limit-reached': {
                dataView(memory0).setInt8(arg1 + 24, 11, true);
                break;
              }
              case 'TLS-protocol-error': {
                dataView(memory0).setInt8(arg1 + 24, 12, true);
                break;
              }
              case 'TLS-certificate-error': {
                dataView(memory0).setInt8(arg1 + 24, 13, true);
                break;
              }
              case 'TLS-alert-received': {
                const e = variant41.val;
                dataView(memory0).setInt8(arg1 + 24, 14, true);
                var {alertId: v8_0, alertMessage: v8_1 } = e;
                var variant9 = v8_0;
                if (variant9 === null || variant9=== undefined) {
                  dataView(memory0).setInt8(arg1 + 32, 0, true);
                } else {
                  const e = variant9;
                  dataView(memory0).setInt8(arg1 + 32, 1, true);
                  dataView(memory0).setInt8(arg1 + 33, toUint8(e), true);
                }
                var variant11 = v8_1;
                if (variant11 === null || variant11=== undefined) {
                  dataView(memory0).setInt8(arg1 + 36, 0, true);
                } else {
                  const e = variant11;
                  dataView(memory0).setInt8(arg1 + 36, 1, true);
                  
                  var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
                  var ptr10= encodeRes.ptr;
                  var len10 = encodeRes.len;
                  
                  dataView(memory0).setUint32(arg1 + 44, len10, true);
                  dataView(memory0).setUint32(arg1 + 40, ptr10, true);
                }
                break;
              }
              case 'HTTP-request-denied': {
                dataView(memory0).setInt8(arg1 + 24, 15, true);
                break;
              }
              case 'HTTP-request-length-required': {
                dataView(memory0).setInt8(arg1 + 24, 16, true);
                break;
              }
              case 'HTTP-request-body-size': {
                const e = variant41.val;
                dataView(memory0).setInt8(arg1 + 24, 17, true);
                var variant12 = e;
                if (variant12 === null || variant12=== undefined) {
                  dataView(memory0).setInt8(arg1 + 32, 0, true);
                } else {
                  const e = variant12;
                  dataView(memory0).setInt8(arg1 + 32, 1, true);
                  dataView(memory0).setBigInt64(arg1 + 40, toUint64(e), true);
                }
                break;
              }
              case 'HTTP-request-method-invalid': {
                dataView(memory0).setInt8(arg1 + 24, 18, true);
                break;
              }
              case 'HTTP-request-URI-invalid': {
                dataView(memory0).setInt8(arg1 + 24, 19, true);
                break;
              }
              case 'HTTP-request-URI-too-long': {
                dataView(memory0).setInt8(arg1 + 24, 20, true);
                break;
              }
              case 'HTTP-request-header-section-size': {
                const e = variant41.val;
                dataView(memory0).setInt8(arg1 + 24, 21, true);
                var variant13 = e;
                if (variant13 === null || variant13=== undefined) {
                  dataView(memory0).setInt8(arg1 + 32, 0, true);
                } else {
                  const e = variant13;
                  dataView(memory0).setInt8(arg1 + 32, 1, true);
                  dataView(memory0).setInt32(arg1 + 36, toUint32(e), true);
                }
                break;
              }
              case 'HTTP-request-header-size': {
                const e = variant41.val;
                dataView(memory0).setInt8(arg1 + 24, 22, true);
                var variant18 = e;
                if (variant18 === null || variant18=== undefined) {
                  dataView(memory0).setInt8(arg1 + 32, 0, true);
                } else {
                  const e = variant18;
                  dataView(memory0).setInt8(arg1 + 32, 1, true);
                  var {fieldName: v14_0, fieldSize: v14_1 } = e;
                  var variant16 = v14_0;
                  if (variant16 === null || variant16=== undefined) {
                    dataView(memory0).setInt8(arg1 + 36, 0, true);
                  } else {
                    const e = variant16;
                    dataView(memory0).setInt8(arg1 + 36, 1, true);
                    
                    var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
                    var ptr15= encodeRes.ptr;
                    var len15 = encodeRes.len;
                    
                    dataView(memory0).setUint32(arg1 + 44, len15, true);
                    dataView(memory0).setUint32(arg1 + 40, ptr15, true);
                  }
                  var variant17 = v14_1;
                  if (variant17 === null || variant17=== undefined) {
                    dataView(memory0).setInt8(arg1 + 48, 0, true);
                  } else {
                    const e = variant17;
                    dataView(memory0).setInt8(arg1 + 48, 1, true);
                    dataView(memory0).setInt32(arg1 + 52, toUint32(e), true);
                  }
                }
                break;
              }
              case 'HTTP-request-trailer-section-size': {
                const e = variant41.val;
                dataView(memory0).setInt8(arg1 + 24, 23, true);
                var variant19 = e;
                if (variant19 === null || variant19=== undefined) {
                  dataView(memory0).setInt8(arg1 + 32, 0, true);
                } else {
                  const e = variant19;
                  dataView(memory0).setInt8(arg1 + 32, 1, true);
                  dataView(memory0).setInt32(arg1 + 36, toUint32(e), true);
                }
                break;
              }
              case 'HTTP-request-trailer-size': {
                const e = variant41.val;
                dataView(memory0).setInt8(arg1 + 24, 24, true);
                var {fieldName: v20_0, fieldSize: v20_1 } = e;
                var variant22 = v20_0;
                if (variant22 === null || variant22=== undefined) {
                  dataView(memory0).setInt8(arg1 + 32, 0, true);
                } else {
                  const e = variant22;
                  dataView(memory0).setInt8(arg1 + 32, 1, true);
                  
                  var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
                  var ptr21= encodeRes.ptr;
                  var len21 = encodeRes.len;
                  
                  dataView(memory0).setUint32(arg1 + 40, len21, true);
                  dataView(memory0).setUint32(arg1 + 36, ptr21, true);
                }
                var variant23 = v20_1;
                if (variant23 === null || variant23=== undefined) {
                  dataView(memory0).setInt8(arg1 + 44, 0, true);
                } else {
                  const e = variant23;
                  dataView(memory0).setInt8(arg1 + 44, 1, true);
                  dataView(memory0).setInt32(arg1 + 48, toUint32(e), true);
                }
                break;
              }
              case 'HTTP-response-incomplete': {
                dataView(memory0).setInt8(arg1 + 24, 25, true);
                break;
              }
              case 'HTTP-response-header-section-size': {
                const e = variant41.val;
                dataView(memory0).setInt8(arg1 + 24, 26, true);
                var variant24 = e;
                if (variant24 === null || variant24=== undefined) {
                  dataView(memory0).setInt8(arg1 + 32, 0, true);
                } else {
                  const e = variant24;
                  dataView(memory0).setInt8(arg1 + 32, 1, true);
                  dataView(memory0).setInt32(arg1 + 36, toUint32(e), true);
                }
                break;
              }
              case 'HTTP-response-header-size': {
                const e = variant41.val;
                dataView(memory0).setInt8(arg1 + 24, 27, true);
                var {fieldName: v25_0, fieldSize: v25_1 } = e;
                var variant27 = v25_0;
                if (variant27 === null || variant27=== undefined) {
                  dataView(memory0).setInt8(arg1 + 32, 0, true);
                } else {
                  const e = variant27;
                  dataView(memory0).setInt8(arg1 + 32, 1, true);
                  
                  var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
                  var ptr26= encodeRes.ptr;
                  var len26 = encodeRes.len;
                  
                  dataView(memory0).setUint32(arg1 + 40, len26, true);
                  dataView(memory0).setUint32(arg1 + 36, ptr26, true);
                }
                var variant28 = v25_1;
                if (variant28 === null || variant28=== undefined) {
                  dataView(memory0).setInt8(arg1 + 44, 0, true);
                } else {
                  const e = variant28;
                  dataView(memory0).setInt8(arg1 + 44, 1, true);
                  dataView(memory0).setInt32(arg1 + 48, toUint32(e), true);
                }
                break;
              }
              case 'HTTP-response-body-size': {
                const e = variant41.val;
                dataView(memory0).setInt8(arg1 + 24, 28, true);
                var variant29 = e;
                if (variant29 === null || variant29=== undefined) {
                  dataView(memory0).setInt8(arg1 + 32, 0, true);
                } else {
                  const e = variant29;
                  dataView(memory0).setInt8(arg1 + 32, 1, true);
                  dataView(memory0).setBigInt64(arg1 + 40, toUint64(e), true);
                }
                break;
              }
              case 'HTTP-response-trailer-section-size': {
                const e = variant41.val;
                dataView(memory0).setInt8(arg1 + 24, 29, true);
                var variant30 = e;
                if (variant30 === null || variant30=== undefined) {
                  dataView(memory0).setInt8(arg1 + 32, 0, true);
                } else {
                  const e = variant30;
                  dataView(memory0).setInt8(arg1 + 32, 1, true);
                  dataView(memory0).setInt32(arg1 + 36, toUint32(e), true);
                }
                break;
              }
              case 'HTTP-response-trailer-size': {
                const e = variant41.val;
                dataView(memory0).setInt8(arg1 + 24, 30, true);
                var {fieldName: v31_0, fieldSize: v31_1 } = e;
                var variant33 = v31_0;
                if (variant33 === null || variant33=== undefined) {
                  dataView(memory0).setInt8(arg1 + 32, 0, true);
                } else {
                  const e = variant33;
                  dataView(memory0).setInt8(arg1 + 32, 1, true);
                  
                  var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
                  var ptr32= encodeRes.ptr;
                  var len32 = encodeRes.len;
                  
                  dataView(memory0).setUint32(arg1 + 40, len32, true);
                  dataView(memory0).setUint32(arg1 + 36, ptr32, true);
                }
                var variant34 = v31_1;
                if (variant34 === null || variant34=== undefined) {
                  dataView(memory0).setInt8(arg1 + 44, 0, true);
                } else {
                  const e = variant34;
                  dataView(memory0).setInt8(arg1 + 44, 1, true);
                  dataView(memory0).setInt32(arg1 + 48, toUint32(e), true);
                }
                break;
              }
              case 'HTTP-response-transfer-coding': {
                const e = variant41.val;
                dataView(memory0).setInt8(arg1 + 24, 31, true);
                var variant36 = e;
                if (variant36 === null || variant36=== undefined) {
                  dataView(memory0).setInt8(arg1 + 32, 0, true);
                } else {
                  const e = variant36;
                  dataView(memory0).setInt8(arg1 + 32, 1, true);
                  
                  var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
                  var ptr35= encodeRes.ptr;
                  var len35 = encodeRes.len;
                  
                  dataView(memory0).setUint32(arg1 + 40, len35, true);
                  dataView(memory0).setUint32(arg1 + 36, ptr35, true);
                }
                break;
              }
              case 'HTTP-response-content-coding': {
                const e = variant41.val;
                dataView(memory0).setInt8(arg1 + 24, 32, true);
                var variant38 = e;
                if (variant38 === null || variant38=== undefined) {
                  dataView(memory0).setInt8(arg1 + 32, 0, true);
                } else {
                  const e = variant38;
                  dataView(memory0).setInt8(arg1 + 32, 1, true);
                  
                  var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
                  var ptr37= encodeRes.ptr;
                  var len37 = encodeRes.len;
                  
                  dataView(memory0).setUint32(arg1 + 40, len37, true);
                  dataView(memory0).setUint32(arg1 + 36, ptr37, true);
                }
                break;
              }
              case 'HTTP-response-timeout': {
                dataView(memory0).setInt8(arg1 + 24, 33, true);
                break;
              }
              case 'HTTP-upgrade-failed': {
                dataView(memory0).setInt8(arg1 + 24, 34, true);
                break;
              }
              case 'HTTP-protocol-error': {
                dataView(memory0).setInt8(arg1 + 24, 35, true);
                break;
              }
              case 'loop-detected': {
                dataView(memory0).setInt8(arg1 + 24, 36, true);
                break;
              }
              case 'configuration-error': {
                dataView(memory0).setInt8(arg1 + 24, 37, true);
                break;
              }
              case 'internal-error': {
                const e = variant41.val;
                dataView(memory0).setInt8(arg1 + 24, 38, true);
                var variant40 = e;
                if (variant40 === null || variant40=== undefined) {
                  dataView(memory0).setInt8(arg1 + 32, 0, true);
                } else {
                  const e = variant40;
                  dataView(memory0).setInt8(arg1 + 32, 1, true);
                  
                  var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
                  var ptr39= encodeRes.ptr;
                  var len39 = encodeRes.len;
                  
                  dataView(memory0).setUint32(arg1 + 40, len39, true);
                  dataView(memory0).setUint32(arg1 + 36, ptr39, true);
                }
                break;
              }
              default: {
                throw new TypeError(`invalid variant tag value \`${JSON.stringify(variant41.tag)}\` (received \`${variant41}\`) specified for \`ErrorCode\``);
              }
            }
            
            break;
          }
          default: {
            _debugLog("ERROR: invalid value (expected result as object with 'tag' member)", { value: variant42, valueType: typeof variant42});
            throw new TypeError('invalid variant specified for result');
          }
        }
        
        break;
      }
      case 'err': {
        const e = variant43.val;
        dataView(memory0).setInt8(arg1 + 8, 1, true);
        
        break;
      }
      default: {
        _debugLog("ERROR: invalid value (expected result as object with 'tag' member)", { value: variant43, valueType: typeof variant43});
        throw new TypeError('invalid variant specified for result');
      }
    }
  }
  _debugLog('[iface="wasi:http/types@0.2.10", function="[method]future-incoming-response.get"][Instruction::Return]', {
    funcName: '[method]future-incoming-response.get',
    paramCount: 0,
    async: false,
    postReturn: false
  });
  task.resolve([ret]);
  task.exit();
}
_trampoline62.fnName = 'wasi:http/types@0.2.10#get';

const handleTable17 = [T_FLAG, 0];
handleTable17._createdReps = new Set();


const captureTable17= new Map();
let captureCnt17= 0;

HANDLE_TABLES[17] = handleTable17;

const _trampoline63 = function(arg0, arg1, arg2, arg3) {
  var handle1 = arg0;
  
  var rep2 = handleTable11[(handle1 << 1) + 1] & ~T_FLAG;
  var rsc0 = captureTable11.get(rep2);
  if (!rsc0) {
    rsc0 = Object.create(OutgoingRequest.prototype);
    Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
    Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
  }
  
  else {
    captureTable11.delete(rep2);
  }
  rscTableRemove(handleTable11, handle1);
  let variant6;
  switch (arg1) {
    case 0: {
      variant6 = undefined;
      break;
    }
    case 1: {
      var handle4 = arg2;
      
      var rep5 = handleTable17[(handle4 << 1) + 1] & ~T_FLAG;
      var rsc3 = captureTable17.get(rep5);
      if (!rsc3) {
        rsc3 = Object.create(RequestOptions.prototype);
        Object.defineProperty(rsc3, symbolRscHandle, { writable: true, value: handle4});
        Object.defineProperty(rsc3, symbolRscRep, { writable: true, value: rep5});
      }
      
      else {
        captureTable17.delete(rep5);
      }
      rscTableRemove(handleTable17, handle4);
      variant6 = rsc3;
      break;
    }
    default: {
      throw new TypeError('invalid variant discriminant for option');
    }
  }
  _debugLog('[iface="wasi:http/outgoing-handler@0.2.10", function="handle"] [Instruction::CallInterface] (sync, @ enter)');
  const hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1,
      isAsync: false,
      entryFnName: 'handle',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'result-catch-handler',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(
    0,
    _getGlobalCurrentTaskMeta(0)?.taskID,
    )?.task;
    
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  
  let ret;
  try {
    ret = { tag: 'ok', val: _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => handle(rsc0, variant6),
    })
  };
} catch (e) {
  ret = { tag: 'err', val: getErrorPayload(e) };
}

var variant46 = ret;
switch (variant46.tag) {
  case 'ok': {
    const e = variant46.val;
    dataView(memory0).setInt8(arg3 + 0, 0, true);
    
    if (!(e instanceof FutureIncomingResponse)) {
      throw new TypeError('Resource error: Not a valid \"FutureIncomingResponse\" resource.');
    }
    var handle7 = e[symbolRscHandle];
    if (!handle7) {
      const rep = e[symbolRscRep] || ++captureCnt16;
      captureTable16.set(rep, e);
      handle7 = rscTableCreateOwn(handleTable16, rep);
    }
    
    dataView(memory0).setInt32(arg3 + 8, handle7, true);
    
    break;
  }
  case 'err': {
    const e = variant46.val;
    dataView(memory0).setInt8(arg3 + 0, 1, true);
    var variant45 = e;
    switch (variant45.tag) {
      case 'DNS-timeout': {
        dataView(memory0).setInt8(arg3 + 8, 0, true);
        break;
      }
      case 'DNS-error': {
        const e = variant45.val;
        dataView(memory0).setInt8(arg3 + 8, 1, true);
        var {rcode: v8_0, infoCode: v8_1 } = e;
        var variant10 = v8_0;
        if (variant10 === null || variant10=== undefined) {
          dataView(memory0).setInt8(arg3 + 16, 0, true);
        } else {
          const e = variant10;
          dataView(memory0).setInt8(arg3 + 16, 1, true);
          
          var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
          var ptr9= encodeRes.ptr;
          var len9 = encodeRes.len;
          
          dataView(memory0).setUint32(arg3 + 24, len9, true);
          dataView(memory0).setUint32(arg3 + 20, ptr9, true);
        }
        var variant11 = v8_1;
        if (variant11 === null || variant11=== undefined) {
          dataView(memory0).setInt8(arg3 + 28, 0, true);
        } else {
          const e = variant11;
          dataView(memory0).setInt8(arg3 + 28, 1, true);
          dataView(memory0).setInt16(arg3 + 30, toUint16(e), true);
        }
        break;
      }
      case 'destination-not-found': {
        dataView(memory0).setInt8(arg3 + 8, 2, true);
        break;
      }
      case 'destination-unavailable': {
        dataView(memory0).setInt8(arg3 + 8, 3, true);
        break;
      }
      case 'destination-IP-prohibited': {
        dataView(memory0).setInt8(arg3 + 8, 4, true);
        break;
      }
      case 'destination-IP-unroutable': {
        dataView(memory0).setInt8(arg3 + 8, 5, true);
        break;
      }
      case 'connection-refused': {
        dataView(memory0).setInt8(arg3 + 8, 6, true);
        break;
      }
      case 'connection-terminated': {
        dataView(memory0).setInt8(arg3 + 8, 7, true);
        break;
      }
      case 'connection-timeout': {
        dataView(memory0).setInt8(arg3 + 8, 8, true);
        break;
      }
      case 'connection-read-timeout': {
        dataView(memory0).setInt8(arg3 + 8, 9, true);
        break;
      }
      case 'connection-write-timeout': {
        dataView(memory0).setInt8(arg3 + 8, 10, true);
        break;
      }
      case 'connection-limit-reached': {
        dataView(memory0).setInt8(arg3 + 8, 11, true);
        break;
      }
      case 'TLS-protocol-error': {
        dataView(memory0).setInt8(arg3 + 8, 12, true);
        break;
      }
      case 'TLS-certificate-error': {
        dataView(memory0).setInt8(arg3 + 8, 13, true);
        break;
      }
      case 'TLS-alert-received': {
        const e = variant45.val;
        dataView(memory0).setInt8(arg3 + 8, 14, true);
        var {alertId: v12_0, alertMessage: v12_1 } = e;
        var variant13 = v12_0;
        if (variant13 === null || variant13=== undefined) {
          dataView(memory0).setInt8(arg3 + 16, 0, true);
        } else {
          const e = variant13;
          dataView(memory0).setInt8(arg3 + 16, 1, true);
          dataView(memory0).setInt8(arg3 + 17, toUint8(e), true);
        }
        var variant15 = v12_1;
        if (variant15 === null || variant15=== undefined) {
          dataView(memory0).setInt8(arg3 + 20, 0, true);
        } else {
          const e = variant15;
          dataView(memory0).setInt8(arg3 + 20, 1, true);
          
          var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
          var ptr14= encodeRes.ptr;
          var len14 = encodeRes.len;
          
          dataView(memory0).setUint32(arg3 + 28, len14, true);
          dataView(memory0).setUint32(arg3 + 24, ptr14, true);
        }
        break;
      }
      case 'HTTP-request-denied': {
        dataView(memory0).setInt8(arg3 + 8, 15, true);
        break;
      }
      case 'HTTP-request-length-required': {
        dataView(memory0).setInt8(arg3 + 8, 16, true);
        break;
      }
      case 'HTTP-request-body-size': {
        const e = variant45.val;
        dataView(memory0).setInt8(arg3 + 8, 17, true);
        var variant16 = e;
        if (variant16 === null || variant16=== undefined) {
          dataView(memory0).setInt8(arg3 + 16, 0, true);
        } else {
          const e = variant16;
          dataView(memory0).setInt8(arg3 + 16, 1, true);
          dataView(memory0).setBigInt64(arg3 + 24, toUint64(e), true);
        }
        break;
      }
      case 'HTTP-request-method-invalid': {
        dataView(memory0).setInt8(arg3 + 8, 18, true);
        break;
      }
      case 'HTTP-request-URI-invalid': {
        dataView(memory0).setInt8(arg3 + 8, 19, true);
        break;
      }
      case 'HTTP-request-URI-too-long': {
        dataView(memory0).setInt8(arg3 + 8, 20, true);
        break;
      }
      case 'HTTP-request-header-section-size': {
        const e = variant45.val;
        dataView(memory0).setInt8(arg3 + 8, 21, true);
        var variant17 = e;
        if (variant17 === null || variant17=== undefined) {
          dataView(memory0).setInt8(arg3 + 16, 0, true);
        } else {
          const e = variant17;
          dataView(memory0).setInt8(arg3 + 16, 1, true);
          dataView(memory0).setInt32(arg3 + 20, toUint32(e), true);
        }
        break;
      }
      case 'HTTP-request-header-size': {
        const e = variant45.val;
        dataView(memory0).setInt8(arg3 + 8, 22, true);
        var variant22 = e;
        if (variant22 === null || variant22=== undefined) {
          dataView(memory0).setInt8(arg3 + 16, 0, true);
        } else {
          const e = variant22;
          dataView(memory0).setInt8(arg3 + 16, 1, true);
          var {fieldName: v18_0, fieldSize: v18_1 } = e;
          var variant20 = v18_0;
          if (variant20 === null || variant20=== undefined) {
            dataView(memory0).setInt8(arg3 + 20, 0, true);
          } else {
            const e = variant20;
            dataView(memory0).setInt8(arg3 + 20, 1, true);
            
            var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
            var ptr19= encodeRes.ptr;
            var len19 = encodeRes.len;
            
            dataView(memory0).setUint32(arg3 + 28, len19, true);
            dataView(memory0).setUint32(arg3 + 24, ptr19, true);
          }
          var variant21 = v18_1;
          if (variant21 === null || variant21=== undefined) {
            dataView(memory0).setInt8(arg3 + 32, 0, true);
          } else {
            const e = variant21;
            dataView(memory0).setInt8(arg3 + 32, 1, true);
            dataView(memory0).setInt32(arg3 + 36, toUint32(e), true);
          }
        }
        break;
      }
      case 'HTTP-request-trailer-section-size': {
        const e = variant45.val;
        dataView(memory0).setInt8(arg3 + 8, 23, true);
        var variant23 = e;
        if (variant23 === null || variant23=== undefined) {
          dataView(memory0).setInt8(arg3 + 16, 0, true);
        } else {
          const e = variant23;
          dataView(memory0).setInt8(arg3 + 16, 1, true);
          dataView(memory0).setInt32(arg3 + 20, toUint32(e), true);
        }
        break;
      }
      case 'HTTP-request-trailer-size': {
        const e = variant45.val;
        dataView(memory0).setInt8(arg3 + 8, 24, true);
        var {fieldName: v24_0, fieldSize: v24_1 } = e;
        var variant26 = v24_0;
        if (variant26 === null || variant26=== undefined) {
          dataView(memory0).setInt8(arg3 + 16, 0, true);
        } else {
          const e = variant26;
          dataView(memory0).setInt8(arg3 + 16, 1, true);
          
          var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
          var ptr25= encodeRes.ptr;
          var len25 = encodeRes.len;
          
          dataView(memory0).setUint32(arg3 + 24, len25, true);
          dataView(memory0).setUint32(arg3 + 20, ptr25, true);
        }
        var variant27 = v24_1;
        if (variant27 === null || variant27=== undefined) {
          dataView(memory0).setInt8(arg3 + 28, 0, true);
        } else {
          const e = variant27;
          dataView(memory0).setInt8(arg3 + 28, 1, true);
          dataView(memory0).setInt32(arg3 + 32, toUint32(e), true);
        }
        break;
      }
      case 'HTTP-response-incomplete': {
        dataView(memory0).setInt8(arg3 + 8, 25, true);
        break;
      }
      case 'HTTP-response-header-section-size': {
        const e = variant45.val;
        dataView(memory0).setInt8(arg3 + 8, 26, true);
        var variant28 = e;
        if (variant28 === null || variant28=== undefined) {
          dataView(memory0).setInt8(arg3 + 16, 0, true);
        } else {
          const e = variant28;
          dataView(memory0).setInt8(arg3 + 16, 1, true);
          dataView(memory0).setInt32(arg3 + 20, toUint32(e), true);
        }
        break;
      }
      case 'HTTP-response-header-size': {
        const e = variant45.val;
        dataView(memory0).setInt8(arg3 + 8, 27, true);
        var {fieldName: v29_0, fieldSize: v29_1 } = e;
        var variant31 = v29_0;
        if (variant31 === null || variant31=== undefined) {
          dataView(memory0).setInt8(arg3 + 16, 0, true);
        } else {
          const e = variant31;
          dataView(memory0).setInt8(arg3 + 16, 1, true);
          
          var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
          var ptr30= encodeRes.ptr;
          var len30 = encodeRes.len;
          
          dataView(memory0).setUint32(arg3 + 24, len30, true);
          dataView(memory0).setUint32(arg3 + 20, ptr30, true);
        }
        var variant32 = v29_1;
        if (variant32 === null || variant32=== undefined) {
          dataView(memory0).setInt8(arg3 + 28, 0, true);
        } else {
          const e = variant32;
          dataView(memory0).setInt8(arg3 + 28, 1, true);
          dataView(memory0).setInt32(arg3 + 32, toUint32(e), true);
        }
        break;
      }
      case 'HTTP-response-body-size': {
        const e = variant45.val;
        dataView(memory0).setInt8(arg3 + 8, 28, true);
        var variant33 = e;
        if (variant33 === null || variant33=== undefined) {
          dataView(memory0).setInt8(arg3 + 16, 0, true);
        } else {
          const e = variant33;
          dataView(memory0).setInt8(arg3 + 16, 1, true);
          dataView(memory0).setBigInt64(arg3 + 24, toUint64(e), true);
        }
        break;
      }
      case 'HTTP-response-trailer-section-size': {
        const e = variant45.val;
        dataView(memory0).setInt8(arg3 + 8, 29, true);
        var variant34 = e;
        if (variant34 === null || variant34=== undefined) {
          dataView(memory0).setInt8(arg3 + 16, 0, true);
        } else {
          const e = variant34;
          dataView(memory0).setInt8(arg3 + 16, 1, true);
          dataView(memory0).setInt32(arg3 + 20, toUint32(e), true);
        }
        break;
      }
      case 'HTTP-response-trailer-size': {
        const e = variant45.val;
        dataView(memory0).setInt8(arg3 + 8, 30, true);
        var {fieldName: v35_0, fieldSize: v35_1 } = e;
        var variant37 = v35_0;
        if (variant37 === null || variant37=== undefined) {
          dataView(memory0).setInt8(arg3 + 16, 0, true);
        } else {
          const e = variant37;
          dataView(memory0).setInt8(arg3 + 16, 1, true);
          
          var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
          var ptr36= encodeRes.ptr;
          var len36 = encodeRes.len;
          
          dataView(memory0).setUint32(arg3 + 24, len36, true);
          dataView(memory0).setUint32(arg3 + 20, ptr36, true);
        }
        var variant38 = v35_1;
        if (variant38 === null || variant38=== undefined) {
          dataView(memory0).setInt8(arg3 + 28, 0, true);
        } else {
          const e = variant38;
          dataView(memory0).setInt8(arg3 + 28, 1, true);
          dataView(memory0).setInt32(arg3 + 32, toUint32(e), true);
        }
        break;
      }
      case 'HTTP-response-transfer-coding': {
        const e = variant45.val;
        dataView(memory0).setInt8(arg3 + 8, 31, true);
        var variant40 = e;
        if (variant40 === null || variant40=== undefined) {
          dataView(memory0).setInt8(arg3 + 16, 0, true);
        } else {
          const e = variant40;
          dataView(memory0).setInt8(arg3 + 16, 1, true);
          
          var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
          var ptr39= encodeRes.ptr;
          var len39 = encodeRes.len;
          
          dataView(memory0).setUint32(arg3 + 24, len39, true);
          dataView(memory0).setUint32(arg3 + 20, ptr39, true);
        }
        break;
      }
      case 'HTTP-response-content-coding': {
        const e = variant45.val;
        dataView(memory0).setInt8(arg3 + 8, 32, true);
        var variant42 = e;
        if (variant42 === null || variant42=== undefined) {
          dataView(memory0).setInt8(arg3 + 16, 0, true);
        } else {
          const e = variant42;
          dataView(memory0).setInt8(arg3 + 16, 1, true);
          
          var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
          var ptr41= encodeRes.ptr;
          var len41 = encodeRes.len;
          
          dataView(memory0).setUint32(arg3 + 24, len41, true);
          dataView(memory0).setUint32(arg3 + 20, ptr41, true);
        }
        break;
      }
      case 'HTTP-response-timeout': {
        dataView(memory0).setInt8(arg3 + 8, 33, true);
        break;
      }
      case 'HTTP-upgrade-failed': {
        dataView(memory0).setInt8(arg3 + 8, 34, true);
        break;
      }
      case 'HTTP-protocol-error': {
        dataView(memory0).setInt8(arg3 + 8, 35, true);
        break;
      }
      case 'loop-detected': {
        dataView(memory0).setInt8(arg3 + 8, 36, true);
        break;
      }
      case 'configuration-error': {
        dataView(memory0).setInt8(arg3 + 8, 37, true);
        break;
      }
      case 'internal-error': {
        const e = variant45.val;
        dataView(memory0).setInt8(arg3 + 8, 38, true);
        var variant44 = e;
        if (variant44 === null || variant44=== undefined) {
          dataView(memory0).setInt8(arg3 + 16, 0, true);
        } else {
          const e = variant44;
          dataView(memory0).setInt8(arg3 + 16, 1, true);
          
          var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
          var ptr43= encodeRes.ptr;
          var len43 = encodeRes.len;
          
          dataView(memory0).setUint32(arg3 + 24, len43, true);
          dataView(memory0).setUint32(arg3 + 20, ptr43, true);
        }
        break;
      }
      default: {
        throw new TypeError(`invalid variant tag value \`${JSON.stringify(variant45.tag)}\` (received \`${variant45}\`) specified for \`ErrorCode\``);
      }
    }
    
    break;
  }
  default: {
    _debugLog("ERROR: invalid value (expected result as object with 'tag' member)", { value: variant46, valueType: typeof variant46});
    throw new TypeError('invalid variant specified for result');
  }
}
_debugLog('[iface="wasi:http/outgoing-handler@0.2.10", function="handle"][Instruction::Return]', {
  funcName: 'handle',
  paramCount: 0,
  async: false,
  postReturn: false
});
task.resolve([ret]);
task.exit();
}
_trampoline63.fnName = 'wasi:http/outgoing-handler@0.2.10#handle';

const handleTable0 = [T_FLAG, 0];
handleTable0._createdReps = new Set();


const captureTable0= new Map();
let captureCnt0= 0;

HANDLE_TABLES[0] = handleTable0;

const _trampoline64 = function(arg0, arg1, arg2, arg3) {
  var handle1 = arg0;
  
  var rep2 = handleTable0[(handle1 << 1) + 1] & ~T_FLAG;
  var rsc0 = captureTable0.get(rep2);
  if (!rsc0) {
    rsc0 = Object.create(DraftSessionHandle.prototype);
    Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
    Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
  }
  
  curResourceBorrows.push(rsc0);
  var len35 = arg2;
  var base35 = arg1;
  var result35 = [];
  for (let i = 0; i < len35; i++) {
    const base = base35 + i * 64;
    let variant34;
    switch (dataView(memory0).getUint8(base + 0, true)) {
      case 0: {
        var ptr3 = dataView(memory0).getUint32(base + 4, true);
        var len3 = dataView(memory0).getUint32(base + 8, true);
        var result3 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr3, len3));
        var ptr4 = dataView(memory0).getUint32(base + 12, true);
        var len4 = dataView(memory0).getUint32(base + 16, true);
        var result4 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr4, len4));
        var ptr5 = dataView(memory0).getUint32(base + 20, true);
        var len5 = dataView(memory0).getUint32(base + 24, true);
        var result5 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr5, len5));
        var len14 = dataView(memory0).getUint32(base + 32, true);
        var base14 = dataView(memory0).getUint32(base + 28, true);
        var result14 = [];
        for (let i = 0; i < len14; i++) {
          const base = base14 + i * 24;
          var ptr6 = dataView(memory0).getUint32(base + 0, true);
          var len6 = dataView(memory0).getUint32(base + 4, true);
          var result6 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr6, len6));
          let variant13;
          switch (dataView(memory0).getUint8(base + 8, true)) {
            case 0: {
              var ptr7 = dataView(memory0).getUint32(base + 16, true);
              var len7 = dataView(memory0).getUint32(base + 20, true);
              var result7 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr7, len7));
              variant13= {
                tag: 'text',
                val: result7
              };
              break;
            }
            case 1: {
              variant13= {
                tag: 'integer',
                val: dataView(memory0).getBigInt64(base + 16, true)
              };
              break;
            }
            case 2: {
              variant13= {
                tag: 'decimal',
                val: dataView(memory0).getFloat64(base + 16, true)
              };
              break;
            }
            case 3: {
              var bool8 = dataView(memory0).getUint8(base + 16, true);
              variant13= {
                tag: 'boolean',
                val: bool8 == 0 ? false : (bool8 == 1 ? true : throwInvalidBool())
              };
              break;
            }
            case 4: {
              var ptr9 = dataView(memory0).getUint32(base + 16, true);
              var len9 = dataView(memory0).getUint32(base + 20, true);
              var result9 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr9, len9));
              variant13= {
                tag: 'date-time',
                val: result9
              };
              break;
            }
            case 5: {
              var ptr10 = dataView(memory0).getUint32(base + 16, true);
              var len10 = dataView(memory0).getUint32(base + 20, true);
              var result10 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr10, len10));
              variant13= {
                tag: 'node-id',
                val: result10
              };
              break;
            }
            case 6: {
              var len12 = dataView(memory0).getUint32(base + 20, true);
              var base12 = dataView(memory0).getUint32(base + 16, true);
              var result12 = [];
              for (let i = 0; i < len12; i++) {
                const base = base12 + i * 8;
                var ptr11 = dataView(memory0).getUint32(base + 0, true);
                var len11 = dataView(memory0).getUint32(base + 4, true);
                var result11 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr11, len11));
                result12.push(result11);
              }
              variant13= {
                tag: 'list-of-text',
                val: result12
              };
              break;
            }
            case 7: {
              variant13= {
                tag: 'none',
              };
              break;
            }
            default: {
              throw new TypeError('invalid variant discriminant for PropertyValue');
            }
          }
          result14.push({
            name: result6,
            value: variant13,
          });
        }
        var ptr15 = dataView(memory0).getUint32(base + 36, true);
        var len15 = dataView(memory0).getUint32(base + 40, true);
        var result15 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr15, len15));
        var ptr16 = dataView(memory0).getUint32(base + 44, true);
        var len16 = dataView(memory0).getUint32(base + 48, true);
        var result16 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr16, len16));
        let variant18;
        switch (dataView(memory0).getUint8(base + 52, true)) {
          case 0: {
            variant18 = undefined;
            break;
          }
          case 1: {
            var ptr17 = dataView(memory0).getUint32(base + 56, true);
            var len17 = dataView(memory0).getUint32(base + 60, true);
            var result17 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr17, len17));
            variant18 = result17;
            break;
          }
          default: {
            throw new TypeError('invalid variant discriminant for option');
          }
        }
        variant34= {
          tag: 'node-created',
          val: {
            eventId: result3,
            id: result4,
            nodeType: result5,
            properties: result14,
            timestamp: result15,
            deviceId: result16,
            batchId: variant18,
          }
        };
        break;
      }
      case 1: {
        var ptr19 = dataView(memory0).getUint32(base + 4, true);
        var len19 = dataView(memory0).getUint32(base + 8, true);
        var result19 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr19, len19));
        var ptr20 = dataView(memory0).getUint32(base + 12, true);
        var len20 = dataView(memory0).getUint32(base + 16, true);
        var result20 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr20, len20));
        var len29 = dataView(memory0).getUint32(base + 24, true);
        var base29 = dataView(memory0).getUint32(base + 20, true);
        var result29 = [];
        for (let i = 0; i < len29; i++) {
          const base = base29 + i * 24;
          var ptr21 = dataView(memory0).getUint32(base + 0, true);
          var len21 = dataView(memory0).getUint32(base + 4, true);
          var result21 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr21, len21));
          let variant28;
          switch (dataView(memory0).getUint8(base + 8, true)) {
            case 0: {
              var ptr22 = dataView(memory0).getUint32(base + 16, true);
              var len22 = dataView(memory0).getUint32(base + 20, true);
              var result22 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr22, len22));
              variant28= {
                tag: 'text',
                val: result22
              };
              break;
            }
            case 1: {
              variant28= {
                tag: 'integer',
                val: dataView(memory0).getBigInt64(base + 16, true)
              };
              break;
            }
            case 2: {
              variant28= {
                tag: 'decimal',
                val: dataView(memory0).getFloat64(base + 16, true)
              };
              break;
            }
            case 3: {
              var bool23 = dataView(memory0).getUint8(base + 16, true);
              variant28= {
                tag: 'boolean',
                val: bool23 == 0 ? false : (bool23 == 1 ? true : throwInvalidBool())
              };
              break;
            }
            case 4: {
              var ptr24 = dataView(memory0).getUint32(base + 16, true);
              var len24 = dataView(memory0).getUint32(base + 20, true);
              var result24 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr24, len24));
              variant28= {
                tag: 'date-time',
                val: result24
              };
              break;
            }
            case 5: {
              var ptr25 = dataView(memory0).getUint32(base + 16, true);
              var len25 = dataView(memory0).getUint32(base + 20, true);
              var result25 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr25, len25));
              variant28= {
                tag: 'node-id',
                val: result25
              };
              break;
            }
            case 6: {
              var len27 = dataView(memory0).getUint32(base + 20, true);
              var base27 = dataView(memory0).getUint32(base + 16, true);
              var result27 = [];
              for (let i = 0; i < len27; i++) {
                const base = base27 + i * 8;
                var ptr26 = dataView(memory0).getUint32(base + 0, true);
                var len26 = dataView(memory0).getUint32(base + 4, true);
                var result26 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr26, len26));
                result27.push(result26);
              }
              variant28= {
                tag: 'list-of-text',
                val: result27
              };
              break;
            }
            case 7: {
              variant28= {
                tag: 'none',
              };
              break;
            }
            default: {
              throw new TypeError('invalid variant discriminant for PropertyValue');
            }
          }
          result29.push({
            name: result21,
            value: variant28,
          });
        }
        var ptr30 = dataView(memory0).getUint32(base + 28, true);
        var len30 = dataView(memory0).getUint32(base + 32, true);
        var result30 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr30, len30));
        var ptr31 = dataView(memory0).getUint32(base + 36, true);
        var len31 = dataView(memory0).getUint32(base + 40, true);
        var result31 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr31, len31));
        let variant33;
        switch (dataView(memory0).getUint8(base + 44, true)) {
          case 0: {
            variant33 = undefined;
            break;
          }
          case 1: {
            var ptr32 = dataView(memory0).getUint32(base + 48, true);
            var len32 = dataView(memory0).getUint32(base + 52, true);
            var result32 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr32, len32));
            variant33 = result32;
            break;
          }
          default: {
            throw new TypeError('invalid variant discriminant for option');
          }
        }
        variant34= {
          tag: 'node-properties-updated',
          val: {
            eventId: result19,
            id: result20,
            changes: result29,
            timestamp: result30,
            deviceId: result31,
            batchId: variant33,
          }
        };
        break;
      }
      default: {
        throw new TypeError('invalid variant discriminant for DraftEvent');
      }
    }
    result35.push(variant34);
  }
  _debugLog('[iface="canopy:graph/draft-session", function="[method]draft-session-handle.apply-events"] [Instruction::CallInterface] (sync, @ enter)');
  const hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1,
      isAsync: false,
      entryFnName: 'applyEvents',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'result-catch-handler',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(
    0,
    _getGlobalCurrentTaskMeta(0)?.taskID,
    )?.task;
    
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  
  let ret;
  try {
    ret = { tag: 'ok', val: _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => rsc0.applyEvents(result35),
    })
  };
} catch (e) {
  ret = { tag: 'err', val: getErrorPayload(e) };
}

for (const rsc of curResourceBorrows) {
  rsc[symbolRscHandle] = undefined;
}
curResourceBorrows = [];
var variant37 = ret;
switch (variant37.tag) {
  case 'ok': {
    const e = variant37.val;
    dataView(memory0).setInt8(arg3 + 0, 0, true);
    
    break;
  }
  case 'err': {
    const e = variant37.val;
    dataView(memory0).setInt8(arg3 + 0, 1, true);
    var val36 = e;
    let enum36;
    switch (val36) {
      case 'parent-not-found': {
        enum36 = 0;
        break;
      }
      case 'unauthorized': {
        enum36 = 1;
        break;
      }
      case 'invalid-event-format': {
        enum36 = 2;
        break;
      }
      case 'validation-failure': {
        enum36 = 3;
        break;
      }
      case 'concurrent-modification': {
        enum36 = 4;
        break;
      }
      case 'storage-error': {
        enum36 = 5;
        break;
      }
      default: {
        if ((e) instanceof Error) {
          console.error(e);
        }
        
        throw new TypeError(`"${val36}" is not one of the cases of draft-error`);
      }
    }
    dataView(memory0).setInt8(arg3 + 1, enum36, true);
    
    break;
  }
  default: {
    _debugLog("ERROR: invalid value (expected result as object with 'tag' member)", { value: variant37, valueType: typeof variant37});
    throw new TypeError('invalid variant specified for result');
  }
}
_debugLog('[iface="canopy:graph/draft-session", function="[method]draft-session-handle.apply-events"][Instruction::Return]', {
  funcName: '[method]draft-session-handle.apply-events',
  paramCount: 0,
  async: false,
  postReturn: false
});
task.resolve([ret]);
task.exit();
}
_trampoline64.fnName = 'canopy:graph/draft-session#applyEvents';

const _trampoline65 = function(arg0, arg1) {
  var handle1 = arg0;
  
  var rep2 = handleTable0[(handle1 << 1) + 1] & ~T_FLAG;
  var rsc0 = captureTable0.get(rep2);
  if (!rsc0) {
    rsc0 = Object.create(DraftSessionHandle.prototype);
    Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
    Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
  }
  
  curResourceBorrows.push(rsc0);
  _debugLog('[iface="canopy:graph/draft-session", function="[method]draft-session-handle.get-parent-revision"] [Instruction::CallInterface] (sync, @ enter)');
  const hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1,
      isAsync: false,
      entryFnName: 'getParentRevision',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'result-catch-handler',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(
    0,
    _getGlobalCurrentTaskMeta(0)?.taskID,
    )?.task;
    
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  
  let ret;
  try {
    ret = { tag: 'ok', val: _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => rsc0.getParentRevision(),
    })
  };
} catch (e) {
  ret = { tag: 'err', val: getErrorPayload(e) };
}

for (const rsc of curResourceBorrows) {
  rsc[symbolRscHandle] = undefined;
}
curResourceBorrows = [];
var variant5 = ret;
switch (variant5.tag) {
  case 'ok': {
    const e = variant5.val;
    dataView(memory0).setInt8(arg1 + 0, 0, true);
    
    var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
    var ptr3= encodeRes.ptr;
    var len3 = encodeRes.len;
    
    dataView(memory0).setUint32(arg1 + 8, len3, true);
    dataView(memory0).setUint32(arg1 + 4, ptr3, true);
    
    break;
  }
  case 'err': {
    const e = variant5.val;
    dataView(memory0).setInt8(arg1 + 0, 1, true);
    var val4 = e;
    let enum4;
    switch (val4) {
      case 'parent-not-found': {
        enum4 = 0;
        break;
      }
      case 'unauthorized': {
        enum4 = 1;
        break;
      }
      case 'invalid-event-format': {
        enum4 = 2;
        break;
      }
      case 'validation-failure': {
        enum4 = 3;
        break;
      }
      case 'concurrent-modification': {
        enum4 = 4;
        break;
      }
      case 'storage-error': {
        enum4 = 5;
        break;
      }
      default: {
        if ((e) instanceof Error) {
          console.error(e);
        }
        
        throw new TypeError(`"${val4}" is not one of the cases of draft-error`);
      }
    }
    dataView(memory0).setInt8(arg1 + 4, enum4, true);
    
    break;
  }
  default: {
    _debugLog("ERROR: invalid value (expected result as object with 'tag' member)", { value: variant5, valueType: typeof variant5});
    throw new TypeError('invalid variant specified for result');
  }
}
_debugLog('[iface="canopy:graph/draft-session", function="[method]draft-session-handle.get-parent-revision"][Instruction::Return]', {
  funcName: '[method]draft-session-handle.get-parent-revision',
  paramCount: 0,
  async: false,
  postReturn: false
});
task.resolve([ret]);
task.exit();
}
_trampoline65.fnName = 'canopy:graph/draft-session#getParentRevision';

const _trampoline66 = function(arg0, arg1, arg2, arg3) {
  var handle1 = arg0;
  
  var rep2 = handleTable0[(handle1 << 1) + 1] & ~T_FLAG;
  var rsc0 = captureTable0.get(rep2);
  if (!rsc0) {
    rsc0 = Object.create(DraftSessionHandle.prototype);
    Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
    Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
  }
  
  curResourceBorrows.push(rsc0);
  var ptr3 = arg1;
  var len3 = arg2;
  var result3 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr3, len3));
  _debugLog('[iface="canopy:graph/draft-session", function="[method]draft-session-handle.get-node"] [Instruction::CallInterface] (sync, @ enter)');
  const hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1,
      isAsync: false,
      entryFnName: 'getNode',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'result-catch-handler',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(
    0,
    _getGlobalCurrentTaskMeta(0)?.taskID,
    )?.task;
    
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  
  let ret;
  try {
    ret = { tag: 'ok', val: _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => rsc0.getNode(result3),
    })
  };
} catch (e) {
  ret = { tag: 'err', val: getErrorPayload(e) };
}

for (const rsc of curResourceBorrows) {
  rsc[symbolRscHandle] = undefined;
}
curResourceBorrows = [];
var variant17 = ret;
switch (variant17.tag) {
  case 'ok': {
    const e = variant17.val;
    dataView(memory0).setInt8(arg3 + 0, 0, true);
    var {id: v4_0, nodeType: v4_1, properties: v4_2 } = e;
    
    var encodeRes = _utf8AllocateAndEncode(v4_0, realloc0, memory0);
    var ptr5= encodeRes.ptr;
    var len5 = encodeRes.len;
    
    dataView(memory0).setUint32(arg3 + 8, len5, true);
    dataView(memory0).setUint32(arg3 + 4, ptr5, true);
    
    var encodeRes = _utf8AllocateAndEncode(v4_1, realloc0, memory0);
    var ptr6= encodeRes.ptr;
    var len6 = encodeRes.len;
    
    dataView(memory0).setUint32(arg3 + 16, len6, true);
    dataView(memory0).setUint32(arg3 + 12, ptr6, true);
    var vec15 = v4_2;
    var len15 = vec15.length;
    var result15 = realloc0(0, 0, 8, len15 * 24);
    for (let i = 0; i < vec15.length; i++) {
      const e = vec15[i];
      const base = result15 + i * 24;var {name: v7_0, value: v7_1 } = e;
      
      var encodeRes = _utf8AllocateAndEncode(v7_0, realloc0, memory0);
      var ptr8= encodeRes.ptr;
      var len8 = encodeRes.len;
      
      dataView(memory0).setUint32(base + 4, len8, true);
      dataView(memory0).setUint32(base + 0, ptr8, true);
      var variant14 = v7_1;
      switch (variant14.tag) {
        case 'text': {
          const e = variant14.val;
          dataView(memory0).setInt8(base + 8, 0, true);
          
          var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
          var ptr9= encodeRes.ptr;
          var len9 = encodeRes.len;
          
          dataView(memory0).setUint32(base + 20, len9, true);
          dataView(memory0).setUint32(base + 16, ptr9, true);
          break;
        }
        case 'integer': {
          const e = variant14.val;
          dataView(memory0).setInt8(base + 8, 1, true);
          dataView(memory0).setBigInt64(base + 16, toInt64(e), true);
          break;
        }
        case 'decimal': {
          const e = variant14.val;
          dataView(memory0).setInt8(base + 8, 2, true);
          dataView(memory0).setFloat64(base + 16, +e, true);
          break;
        }
        case 'boolean': {
          const e = variant14.val;
          dataView(memory0).setInt8(base + 8, 3, true);
          dataView(memory0).setInt8(base + 16, e ? 1 : 0, true);
          break;
        }
        case 'date-time': {
          const e = variant14.val;
          dataView(memory0).setInt8(base + 8, 4, true);
          
          var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
          var ptr10= encodeRes.ptr;
          var len10 = encodeRes.len;
          
          dataView(memory0).setUint32(base + 20, len10, true);
          dataView(memory0).setUint32(base + 16, ptr10, true);
          break;
        }
        case 'node-id': {
          const e = variant14.val;
          dataView(memory0).setInt8(base + 8, 5, true);
          
          var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
          var ptr11= encodeRes.ptr;
          var len11 = encodeRes.len;
          
          dataView(memory0).setUint32(base + 20, len11, true);
          dataView(memory0).setUint32(base + 16, ptr11, true);
          break;
        }
        case 'list-of-text': {
          const e = variant14.val;
          dataView(memory0).setInt8(base + 8, 6, true);
          var vec13 = e;
          var len13 = vec13.length;
          var result13 = realloc0(0, 0, 4, len13 * 8);
          for (let i = 0; i < vec13.length; i++) {
            const e = vec13[i];
            const base = result13 + i * 8;
            var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
            var ptr12= encodeRes.ptr;
            var len12 = encodeRes.len;
            
            dataView(memory0).setUint32(base + 4, len12, true);
            dataView(memory0).setUint32(base + 0, ptr12, true);
          }
          dataView(memory0).setUint32(base + 20, len13, true);
          dataView(memory0).setUint32(base + 16, result13, true);
          break;
        }
        case 'none': {
          dataView(memory0).setInt8(base + 8, 7, true);
          break;
        }
        default: {
          throw new TypeError(`invalid variant tag value \`${JSON.stringify(variant14.tag)}\` (received \`${variant14}\`) specified for \`PropertyValue\``);
        }
      }
    }
    dataView(memory0).setUint32(arg3 + 24, len15, true);
    dataView(memory0).setUint32(arg3 + 20, result15, true);
    
    break;
  }
  case 'err': {
    const e = variant17.val;
    dataView(memory0).setInt8(arg3 + 0, 1, true);
    var val16 = e;
    let enum16;
    switch (val16) {
      case 'invalid-query': {
        enum16 = 0;
        break;
      }
      case 'node-not-found': {
        enum16 = 1;
        break;
      }
      case 'access-denied': {
        enum16 = 2;
        break;
      }
      default: {
        if ((e) instanceof Error) {
          console.error(e);
        }
        
        throw new TypeError(`"${val16}" is not one of the cases of query-error`);
      }
    }
    dataView(memory0).setInt8(arg3 + 4, enum16, true);
    
    break;
  }
  default: {
    _debugLog("ERROR: invalid value (expected result as object with 'tag' member)", { value: variant17, valueType: typeof variant17});
    throw new TypeError('invalid variant specified for result');
  }
}
_debugLog('[iface="canopy:graph/draft-session", function="[method]draft-session-handle.get-node"][Instruction::Return]', {
  funcName: '[method]draft-session-handle.get-node',
  paramCount: 0,
  async: false,
  postReturn: false
});
task.resolve([ret]);
task.exit();
}
_trampoline66.fnName = 'canopy:graph/draft-session#getNode';

const _trampoline67 = function(arg0, arg1, arg2, arg3) {
  var handle1 = arg0;
  
  var rep2 = handleTable0[(handle1 << 1) + 1] & ~T_FLAG;
  var rsc0 = captureTable0.get(rep2);
  if (!rsc0) {
    rsc0 = Object.create(DraftSessionHandle.prototype);
    Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
    Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
  }
  
  curResourceBorrows.push(rsc0);
  var ptr3 = arg1;
  var len3 = arg2;
  var result3 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr3, len3));
  _debugLog('[iface="canopy:graph/draft-session", function="[method]draft-session-handle.query-nodes"] [Instruction::CallInterface] (sync, @ enter)');
  const hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1,
      isAsync: false,
      entryFnName: 'queryNodes',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'result-catch-handler',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(
    0,
    _getGlobalCurrentTaskMeta(0)?.taskID,
    )?.task;
    
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  
  let ret;
  try {
    ret = { tag: 'ok', val: _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => rsc0.queryNodes(result3),
    })
  };
} catch (e) {
  ret = { tag: 'err', val: getErrorPayload(e) };
}

for (const rsc of curResourceBorrows) {
  rsc[symbolRscHandle] = undefined;
}
curResourceBorrows = [];
var variant18 = ret;
switch (variant18.tag) {
  case 'ok': {
    const e = variant18.val;
    dataView(memory0).setInt8(arg3 + 0, 0, true);
    var vec16 = e;
    var len16 = vec16.length;
    var result16 = realloc0(0, 0, 4, len16 * 24);
    for (let i = 0; i < vec16.length; i++) {
      const e = vec16[i];
      const base = result16 + i * 24;var {id: v4_0, nodeType: v4_1, properties: v4_2 } = e;
      
      var encodeRes = _utf8AllocateAndEncode(v4_0, realloc0, memory0);
      var ptr5= encodeRes.ptr;
      var len5 = encodeRes.len;
      
      dataView(memory0).setUint32(base + 4, len5, true);
      dataView(memory0).setUint32(base + 0, ptr5, true);
      
      var encodeRes = _utf8AllocateAndEncode(v4_1, realloc0, memory0);
      var ptr6= encodeRes.ptr;
      var len6 = encodeRes.len;
      
      dataView(memory0).setUint32(base + 12, len6, true);
      dataView(memory0).setUint32(base + 8, ptr6, true);
      var vec15 = v4_2;
      var len15 = vec15.length;
      var result15 = realloc0(0, 0, 8, len15 * 24);
      for (let i = 0; i < vec15.length; i++) {
        const e = vec15[i];
        const base = result15 + i * 24;var {name: v7_0, value: v7_1 } = e;
        
        var encodeRes = _utf8AllocateAndEncode(v7_0, realloc0, memory0);
        var ptr8= encodeRes.ptr;
        var len8 = encodeRes.len;
        
        dataView(memory0).setUint32(base + 4, len8, true);
        dataView(memory0).setUint32(base + 0, ptr8, true);
        var variant14 = v7_1;
        switch (variant14.tag) {
          case 'text': {
            const e = variant14.val;
            dataView(memory0).setInt8(base + 8, 0, true);
            
            var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
            var ptr9= encodeRes.ptr;
            var len9 = encodeRes.len;
            
            dataView(memory0).setUint32(base + 20, len9, true);
            dataView(memory0).setUint32(base + 16, ptr9, true);
            break;
          }
          case 'integer': {
            const e = variant14.val;
            dataView(memory0).setInt8(base + 8, 1, true);
            dataView(memory0).setBigInt64(base + 16, toInt64(e), true);
            break;
          }
          case 'decimal': {
            const e = variant14.val;
            dataView(memory0).setInt8(base + 8, 2, true);
            dataView(memory0).setFloat64(base + 16, +e, true);
            break;
          }
          case 'boolean': {
            const e = variant14.val;
            dataView(memory0).setInt8(base + 8, 3, true);
            dataView(memory0).setInt8(base + 16, e ? 1 : 0, true);
            break;
          }
          case 'date-time': {
            const e = variant14.val;
            dataView(memory0).setInt8(base + 8, 4, true);
            
            var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
            var ptr10= encodeRes.ptr;
            var len10 = encodeRes.len;
            
            dataView(memory0).setUint32(base + 20, len10, true);
            dataView(memory0).setUint32(base + 16, ptr10, true);
            break;
          }
          case 'node-id': {
            const e = variant14.val;
            dataView(memory0).setInt8(base + 8, 5, true);
            
            var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
            var ptr11= encodeRes.ptr;
            var len11 = encodeRes.len;
            
            dataView(memory0).setUint32(base + 20, len11, true);
            dataView(memory0).setUint32(base + 16, ptr11, true);
            break;
          }
          case 'list-of-text': {
            const e = variant14.val;
            dataView(memory0).setInt8(base + 8, 6, true);
            var vec13 = e;
            var len13 = vec13.length;
            var result13 = realloc0(0, 0, 4, len13 * 8);
            for (let i = 0; i < vec13.length; i++) {
              const e = vec13[i];
              const base = result13 + i * 8;
              var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
              var ptr12= encodeRes.ptr;
              var len12 = encodeRes.len;
              
              dataView(memory0).setUint32(base + 4, len12, true);
              dataView(memory0).setUint32(base + 0, ptr12, true);
            }
            dataView(memory0).setUint32(base + 20, len13, true);
            dataView(memory0).setUint32(base + 16, result13, true);
            break;
          }
          case 'none': {
            dataView(memory0).setInt8(base + 8, 7, true);
            break;
          }
          default: {
            throw new TypeError(`invalid variant tag value \`${JSON.stringify(variant14.tag)}\` (received \`${variant14}\`) specified for \`PropertyValue\``);
          }
        }
      }
      dataView(memory0).setUint32(base + 20, len15, true);
      dataView(memory0).setUint32(base + 16, result15, true);
    }
    dataView(memory0).setUint32(arg3 + 8, len16, true);
    dataView(memory0).setUint32(arg3 + 4, result16, true);
    
    break;
  }
  case 'err': {
    const e = variant18.val;
    dataView(memory0).setInt8(arg3 + 0, 1, true);
    var val17 = e;
    let enum17;
    switch (val17) {
      case 'invalid-query': {
        enum17 = 0;
        break;
      }
      case 'node-not-found': {
        enum17 = 1;
        break;
      }
      case 'access-denied': {
        enum17 = 2;
        break;
      }
      default: {
        if ((e) instanceof Error) {
          console.error(e);
        }
        
        throw new TypeError(`"${val17}" is not one of the cases of query-error`);
      }
    }
    dataView(memory0).setInt8(arg3 + 4, enum17, true);
    
    break;
  }
  default: {
    _debugLog("ERROR: invalid value (expected result as object with 'tag' member)", { value: variant18, valueType: typeof variant18});
    throw new TypeError('invalid variant specified for result');
  }
}
_debugLog('[iface="canopy:graph/draft-session", function="[method]draft-session-handle.query-nodes"][Instruction::Return]', {
  funcName: '[method]draft-session-handle.query-nodes',
  paramCount: 0,
  async: false,
  postReturn: false
});
task.resolve([ret]);
task.exit();
}
_trampoline67.fnName = 'canopy:graph/draft-session#queryNodes';

const _trampoline68 = function(arg0) {
  _debugLog('[iface="wasi:clocks/wall-clock@0.2.10", function="now"] [Instruction::CallInterface] (sync, @ enter)');
  const hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1,
      isAsync: false,
      entryFnName: 'now$1',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(
    0,
    _getGlobalCurrentTaskMeta(0)?.taskID,
    )?.task;
    
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  
  let ret;
  
  try {
    ret = _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => now$1(),
    })
    ;
  } catch (err) {
    
    _debugLog('[Instruction::CallInterface] error during sync call', {
      taskID: task.id(),
      subtaskID: task.getParentSubtask()?.id(),
      err,
    });
    task.setErrored(err);
    task.reject(err);
    task.exit();
    throw err;
    
  }
  
  var {seconds: v0_0, nanoseconds: v0_1 } = ret;
  dataView(memory0).setBigInt64(arg0 + 0, toUint64(v0_0), true);
  dataView(memory0).setInt32(arg0 + 8, toUint32(v0_1), true);
  _debugLog('[iface="wasi:clocks/wall-clock@0.2.10", function="now"][Instruction::Return]', {
    funcName: 'now',
    paramCount: 0,
    async: false,
    postReturn: false
  });
  task.resolve([ret]);
  task.exit();
}
_trampoline68.fnName = 'wasi:clocks/wall-clock@0.2.10#now$1';

const handleTable7 = [T_FLAG, 0];
handleTable7._createdReps = new Set();


const captureTable7= new Map();
let captureCnt7= 0;

HANDLE_TABLES[7] = handleTable7;

const _trampoline69 = function(arg0, arg1) {
  var handle1 = arg0;
  
  var rep2 = handleTable7[(handle1 << 1) + 1] & ~T_FLAG;
  var rsc0 = captureTable7.get(rep2);
  if (!rsc0) {
    rsc0 = Object.create(Descriptor.prototype);
    Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
    Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
  }
  
  curResourceBorrows.push(rsc0);
  _debugLog('[iface="wasi:filesystem/types@0.2.10", function="[method]descriptor.get-flags"] [Instruction::CallInterface] (sync, @ enter)');
  const hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1,
      isAsync: false,
      entryFnName: 'getFlags',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'result-catch-handler',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(
    0,
    _getGlobalCurrentTaskMeta(0)?.taskID,
    )?.task;
    
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  
  let ret;
  try {
    ret = { tag: 'ok', val: _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => rsc0.getFlags(),
    })
  };
} catch (e) {
  ret = { tag: 'err', val: getErrorPayload(e) };
}

for (const rsc of curResourceBorrows) {
  rsc[symbolRscHandle] = undefined;
}
curResourceBorrows = [];
var variant5 = ret;
switch (variant5.tag) {
  case 'ok': {
    const e = variant5.val;
    dataView(memory0).setInt8(arg1 + 0, 0, true);
    let flags3 = 0;
    if (typeof e === 'object' && e !== null) {
      flags3 = Boolean(e.read) << 0 | Boolean(e.write) << 1 | Boolean(e.fileIntegritySync) << 2 | Boolean(e.dataIntegritySync) << 3 | Boolean(e.requestedWriteSync) << 4 | Boolean(e.mutateDirectory) << 5;
    } else if (e !== null && e!== undefined) {
      throw new TypeError('only an object, undefined or null can be converted to flags');
    }
    dataView(memory0).setInt8(arg1 + 1, flags3, true);
    
    break;
  }
  case 'err': {
    const e = variant5.val;
    dataView(memory0).setInt8(arg1 + 0, 1, true);
    var val4 = e;
    let enum4;
    switch (val4) {
      case 'access': {
        enum4 = 0;
        break;
      }
      case 'would-block': {
        enum4 = 1;
        break;
      }
      case 'already': {
        enum4 = 2;
        break;
      }
      case 'bad-descriptor': {
        enum4 = 3;
        break;
      }
      case 'busy': {
        enum4 = 4;
        break;
      }
      case 'deadlock': {
        enum4 = 5;
        break;
      }
      case 'quota': {
        enum4 = 6;
        break;
      }
      case 'exist': {
        enum4 = 7;
        break;
      }
      case 'file-too-large': {
        enum4 = 8;
        break;
      }
      case 'illegal-byte-sequence': {
        enum4 = 9;
        break;
      }
      case 'in-progress': {
        enum4 = 10;
        break;
      }
      case 'interrupted': {
        enum4 = 11;
        break;
      }
      case 'invalid': {
        enum4 = 12;
        break;
      }
      case 'io': {
        enum4 = 13;
        break;
      }
      case 'is-directory': {
        enum4 = 14;
        break;
      }
      case 'loop': {
        enum4 = 15;
        break;
      }
      case 'too-many-links': {
        enum4 = 16;
        break;
      }
      case 'message-size': {
        enum4 = 17;
        break;
      }
      case 'name-too-long': {
        enum4 = 18;
        break;
      }
      case 'no-device': {
        enum4 = 19;
        break;
      }
      case 'no-entry': {
        enum4 = 20;
        break;
      }
      case 'no-lock': {
        enum4 = 21;
        break;
      }
      case 'insufficient-memory': {
        enum4 = 22;
        break;
      }
      case 'insufficient-space': {
        enum4 = 23;
        break;
      }
      case 'not-directory': {
        enum4 = 24;
        break;
      }
      case 'not-empty': {
        enum4 = 25;
        break;
      }
      case 'not-recoverable': {
        enum4 = 26;
        break;
      }
      case 'unsupported': {
        enum4 = 27;
        break;
      }
      case 'no-tty': {
        enum4 = 28;
        break;
      }
      case 'no-such-device': {
        enum4 = 29;
        break;
      }
      case 'overflow': {
        enum4 = 30;
        break;
      }
      case 'not-permitted': {
        enum4 = 31;
        break;
      }
      case 'pipe': {
        enum4 = 32;
        break;
      }
      case 'read-only': {
        enum4 = 33;
        break;
      }
      case 'invalid-seek': {
        enum4 = 34;
        break;
      }
      case 'text-file-busy': {
        enum4 = 35;
        break;
      }
      case 'cross-device': {
        enum4 = 36;
        break;
      }
      default: {
        if ((e) instanceof Error) {
          console.error(e);
        }
        
        throw new TypeError(`"${val4}" is not one of the cases of error-code`);
      }
    }
    dataView(memory0).setInt8(arg1 + 1, enum4, true);
    
    break;
  }
  default: {
    _debugLog("ERROR: invalid value (expected result as object with 'tag' member)", { value: variant5, valueType: typeof variant5});
    throw new TypeError('invalid variant specified for result');
  }
}
_debugLog('[iface="wasi:filesystem/types@0.2.10", function="[method]descriptor.get-flags"][Instruction::Return]', {
  funcName: '[method]descriptor.get-flags',
  paramCount: 0,
  async: false,
  postReturn: false
});
task.resolve([ret]);
task.exit();
}
_trampoline69.fnName = 'wasi:filesystem/types@0.2.10#getFlags';

const _trampoline70 = function(arg0, arg1) {
  var handle1 = arg0;
  
  var rep2 = handleTable7[(handle1 << 1) + 1] & ~T_FLAG;
  var rsc0 = captureTable7.get(rep2);
  if (!rsc0) {
    rsc0 = Object.create(Descriptor.prototype);
    Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
    Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
  }
  
  curResourceBorrows.push(rsc0);
  _debugLog('[iface="wasi:filesystem/types@0.2.10", function="[method]descriptor.get-type"] [Instruction::CallInterface] (sync, @ enter)');
  const hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1,
      isAsync: false,
      entryFnName: 'getType',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'result-catch-handler',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(
    0,
    _getGlobalCurrentTaskMeta(0)?.taskID,
    )?.task;
    
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  
  let ret;
  try {
    ret = { tag: 'ok', val: _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => rsc0.getType(),
    })
  };
} catch (e) {
  ret = { tag: 'err', val: getErrorPayload(e) };
}

for (const rsc of curResourceBorrows) {
  rsc[symbolRscHandle] = undefined;
}
curResourceBorrows = [];
var variant5 = ret;
switch (variant5.tag) {
  case 'ok': {
    const e = variant5.val;
    dataView(memory0).setInt8(arg1 + 0, 0, true);
    var val3 = e;
    let enum3;
    switch (val3) {
      case 'unknown': {
        enum3 = 0;
        break;
      }
      case 'block-device': {
        enum3 = 1;
        break;
      }
      case 'character-device': {
        enum3 = 2;
        break;
      }
      case 'directory': {
        enum3 = 3;
        break;
      }
      case 'fifo': {
        enum3 = 4;
        break;
      }
      case 'symbolic-link': {
        enum3 = 5;
        break;
      }
      case 'regular-file': {
        enum3 = 6;
        break;
      }
      case 'socket': {
        enum3 = 7;
        break;
      }
      default: {
        if ((e) instanceof Error) {
          console.error(e);
        }
        
        throw new TypeError(`"${val3}" is not one of the cases of descriptor-type`);
      }
    }
    dataView(memory0).setInt8(arg1 + 1, enum3, true);
    
    break;
  }
  case 'err': {
    const e = variant5.val;
    dataView(memory0).setInt8(arg1 + 0, 1, true);
    var val4 = e;
    let enum4;
    switch (val4) {
      case 'access': {
        enum4 = 0;
        break;
      }
      case 'would-block': {
        enum4 = 1;
        break;
      }
      case 'already': {
        enum4 = 2;
        break;
      }
      case 'bad-descriptor': {
        enum4 = 3;
        break;
      }
      case 'busy': {
        enum4 = 4;
        break;
      }
      case 'deadlock': {
        enum4 = 5;
        break;
      }
      case 'quota': {
        enum4 = 6;
        break;
      }
      case 'exist': {
        enum4 = 7;
        break;
      }
      case 'file-too-large': {
        enum4 = 8;
        break;
      }
      case 'illegal-byte-sequence': {
        enum4 = 9;
        break;
      }
      case 'in-progress': {
        enum4 = 10;
        break;
      }
      case 'interrupted': {
        enum4 = 11;
        break;
      }
      case 'invalid': {
        enum4 = 12;
        break;
      }
      case 'io': {
        enum4 = 13;
        break;
      }
      case 'is-directory': {
        enum4 = 14;
        break;
      }
      case 'loop': {
        enum4 = 15;
        break;
      }
      case 'too-many-links': {
        enum4 = 16;
        break;
      }
      case 'message-size': {
        enum4 = 17;
        break;
      }
      case 'name-too-long': {
        enum4 = 18;
        break;
      }
      case 'no-device': {
        enum4 = 19;
        break;
      }
      case 'no-entry': {
        enum4 = 20;
        break;
      }
      case 'no-lock': {
        enum4 = 21;
        break;
      }
      case 'insufficient-memory': {
        enum4 = 22;
        break;
      }
      case 'insufficient-space': {
        enum4 = 23;
        break;
      }
      case 'not-directory': {
        enum4 = 24;
        break;
      }
      case 'not-empty': {
        enum4 = 25;
        break;
      }
      case 'not-recoverable': {
        enum4 = 26;
        break;
      }
      case 'unsupported': {
        enum4 = 27;
        break;
      }
      case 'no-tty': {
        enum4 = 28;
        break;
      }
      case 'no-such-device': {
        enum4 = 29;
        break;
      }
      case 'overflow': {
        enum4 = 30;
        break;
      }
      case 'not-permitted': {
        enum4 = 31;
        break;
      }
      case 'pipe': {
        enum4 = 32;
        break;
      }
      case 'read-only': {
        enum4 = 33;
        break;
      }
      case 'invalid-seek': {
        enum4 = 34;
        break;
      }
      case 'text-file-busy': {
        enum4 = 35;
        break;
      }
      case 'cross-device': {
        enum4 = 36;
        break;
      }
      default: {
        if ((e) instanceof Error) {
          console.error(e);
        }
        
        throw new TypeError(`"${val4}" is not one of the cases of error-code`);
      }
    }
    dataView(memory0).setInt8(arg1 + 1, enum4, true);
    
    break;
  }
  default: {
    _debugLog("ERROR: invalid value (expected result as object with 'tag' member)", { value: variant5, valueType: typeof variant5});
    throw new TypeError('invalid variant specified for result');
  }
}
_debugLog('[iface="wasi:filesystem/types@0.2.10", function="[method]descriptor.get-type"][Instruction::Return]', {
  funcName: '[method]descriptor.get-type',
  paramCount: 0,
  async: false,
  postReturn: false
});
task.resolve([ret]);
task.exit();
}
_trampoline70.fnName = 'wasi:filesystem/types@0.2.10#getType';

const _trampoline71 = function(arg0, arg1) {
  var handle1 = arg0;
  
  var rep2 = handleTable1[(handle1 << 1) + 1] & ~T_FLAG;
  var rsc0 = captureTable1.get(rep2);
  if (!rsc0) {
    rsc0 = Object.create(Error$1.prototype);
    Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
    Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
  }
  
  curResourceBorrows.push(rsc0);
  _debugLog('[iface="wasi:filesystem/types@0.2.10", function="filesystem-error-code"] [Instruction::CallInterface] (sync, @ enter)');
  const hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1,
      isAsync: false,
      entryFnName: 'filesystemErrorCode',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(
    0,
    _getGlobalCurrentTaskMeta(0)?.taskID,
    )?.task;
    
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  
  let ret;
  
  try {
    ret = _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => filesystemErrorCode(rsc0),
    })
    ;
  } catch (err) {
    
    _debugLog('[Instruction::CallInterface] error during sync call', {
      taskID: task.id(),
      subtaskID: task.getParentSubtask()?.id(),
      err,
    });
    task.setErrored(err);
    task.reject(err);
    task.exit();
    throw err;
    
  }
  
  for (const rsc of curResourceBorrows) {
    rsc[symbolRscHandle] = undefined;
  }
  curResourceBorrows = [];
  var variant4 = ret;
  if (variant4 === null || variant4=== undefined) {
    dataView(memory0).setInt8(arg1 + 0, 0, true);
  } else {
    const e = variant4;
    dataView(memory0).setInt8(arg1 + 0, 1, true);
    var val3 = e;
    let enum3;
    switch (val3) {
      case 'access': {
        enum3 = 0;
        break;
      }
      case 'would-block': {
        enum3 = 1;
        break;
      }
      case 'already': {
        enum3 = 2;
        break;
      }
      case 'bad-descriptor': {
        enum3 = 3;
        break;
      }
      case 'busy': {
        enum3 = 4;
        break;
      }
      case 'deadlock': {
        enum3 = 5;
        break;
      }
      case 'quota': {
        enum3 = 6;
        break;
      }
      case 'exist': {
        enum3 = 7;
        break;
      }
      case 'file-too-large': {
        enum3 = 8;
        break;
      }
      case 'illegal-byte-sequence': {
        enum3 = 9;
        break;
      }
      case 'in-progress': {
        enum3 = 10;
        break;
      }
      case 'interrupted': {
        enum3 = 11;
        break;
      }
      case 'invalid': {
        enum3 = 12;
        break;
      }
      case 'io': {
        enum3 = 13;
        break;
      }
      case 'is-directory': {
        enum3 = 14;
        break;
      }
      case 'loop': {
        enum3 = 15;
        break;
      }
      case 'too-many-links': {
        enum3 = 16;
        break;
      }
      case 'message-size': {
        enum3 = 17;
        break;
      }
      case 'name-too-long': {
        enum3 = 18;
        break;
      }
      case 'no-device': {
        enum3 = 19;
        break;
      }
      case 'no-entry': {
        enum3 = 20;
        break;
      }
      case 'no-lock': {
        enum3 = 21;
        break;
      }
      case 'insufficient-memory': {
        enum3 = 22;
        break;
      }
      case 'insufficient-space': {
        enum3 = 23;
        break;
      }
      case 'not-directory': {
        enum3 = 24;
        break;
      }
      case 'not-empty': {
        enum3 = 25;
        break;
      }
      case 'not-recoverable': {
        enum3 = 26;
        break;
      }
      case 'unsupported': {
        enum3 = 27;
        break;
      }
      case 'no-tty': {
        enum3 = 28;
        break;
      }
      case 'no-such-device': {
        enum3 = 29;
        break;
      }
      case 'overflow': {
        enum3 = 30;
        break;
      }
      case 'not-permitted': {
        enum3 = 31;
        break;
      }
      case 'pipe': {
        enum3 = 32;
        break;
      }
      case 'read-only': {
        enum3 = 33;
        break;
      }
      case 'invalid-seek': {
        enum3 = 34;
        break;
      }
      case 'text-file-busy': {
        enum3 = 35;
        break;
      }
      case 'cross-device': {
        enum3 = 36;
        break;
      }
      default: {
        if ((e) instanceof Error) {
          console.error(e);
        }
        
        throw new TypeError(`"${val3}" is not one of the cases of error-code`);
      }
    }
    dataView(memory0).setInt8(arg1 + 1, enum3, true);
  }
  _debugLog('[iface="wasi:filesystem/types@0.2.10", function="filesystem-error-code"][Instruction::Return]', {
    funcName: 'filesystem-error-code',
    paramCount: 0,
    async: false,
    postReturn: false
  });
  task.resolve([ret]);
  task.exit();
}
_trampoline71.fnName = 'wasi:filesystem/types@0.2.10#filesystemErrorCode';

const _trampoline72 = function(arg0, arg1, arg2) {
  var handle1 = arg0;
  
  var rep2 = handleTable7[(handle1 << 1) + 1] & ~T_FLAG;
  var rsc0 = captureTable7.get(rep2);
  if (!rsc0) {
    rsc0 = Object.create(Descriptor.prototype);
    Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
    Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
  }
  
  curResourceBorrows.push(rsc0);
  _debugLog('[iface="wasi:filesystem/types@0.2.10", function="[method]descriptor.write-via-stream"] [Instruction::CallInterface] (sync, @ enter)');
  const hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1,
      isAsync: false,
      entryFnName: 'writeViaStream',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'result-catch-handler',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(
    0,
    _getGlobalCurrentTaskMeta(0)?.taskID,
    )?.task;
    
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  
  let ret;
  try {
    ret = { tag: 'ok', val: _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => rsc0.writeViaStream(BigInt.asUintN(64, BigInt(arg1))),
    })
  };
} catch (e) {
  ret = { tag: 'err', val: getErrorPayload(e) };
}

for (const rsc of curResourceBorrows) {
  rsc[symbolRscHandle] = undefined;
}
curResourceBorrows = [];
var variant5 = ret;
switch (variant5.tag) {
  case 'ok': {
    const e = variant5.val;
    dataView(memory0).setInt8(arg2 + 0, 0, true);
    
    if (!(e instanceof OutputStream)) {
      throw new TypeError('Resource error: Not a valid \"OutputStream\" resource.');
    }
    var handle3 = e[symbolRscHandle];
    if (!handle3) {
      const rep = e[symbolRscRep] || ++captureCnt4;
      captureTable4.set(rep, e);
      handle3 = rscTableCreateOwn(handleTable4, rep);
    }
    
    dataView(memory0).setInt32(arg2 + 4, handle3, true);
    
    break;
  }
  case 'err': {
    const e = variant5.val;
    dataView(memory0).setInt8(arg2 + 0, 1, true);
    var val4 = e;
    let enum4;
    switch (val4) {
      case 'access': {
        enum4 = 0;
        break;
      }
      case 'would-block': {
        enum4 = 1;
        break;
      }
      case 'already': {
        enum4 = 2;
        break;
      }
      case 'bad-descriptor': {
        enum4 = 3;
        break;
      }
      case 'busy': {
        enum4 = 4;
        break;
      }
      case 'deadlock': {
        enum4 = 5;
        break;
      }
      case 'quota': {
        enum4 = 6;
        break;
      }
      case 'exist': {
        enum4 = 7;
        break;
      }
      case 'file-too-large': {
        enum4 = 8;
        break;
      }
      case 'illegal-byte-sequence': {
        enum4 = 9;
        break;
      }
      case 'in-progress': {
        enum4 = 10;
        break;
      }
      case 'interrupted': {
        enum4 = 11;
        break;
      }
      case 'invalid': {
        enum4 = 12;
        break;
      }
      case 'io': {
        enum4 = 13;
        break;
      }
      case 'is-directory': {
        enum4 = 14;
        break;
      }
      case 'loop': {
        enum4 = 15;
        break;
      }
      case 'too-many-links': {
        enum4 = 16;
        break;
      }
      case 'message-size': {
        enum4 = 17;
        break;
      }
      case 'name-too-long': {
        enum4 = 18;
        break;
      }
      case 'no-device': {
        enum4 = 19;
        break;
      }
      case 'no-entry': {
        enum4 = 20;
        break;
      }
      case 'no-lock': {
        enum4 = 21;
        break;
      }
      case 'insufficient-memory': {
        enum4 = 22;
        break;
      }
      case 'insufficient-space': {
        enum4 = 23;
        break;
      }
      case 'not-directory': {
        enum4 = 24;
        break;
      }
      case 'not-empty': {
        enum4 = 25;
        break;
      }
      case 'not-recoverable': {
        enum4 = 26;
        break;
      }
      case 'unsupported': {
        enum4 = 27;
        break;
      }
      case 'no-tty': {
        enum4 = 28;
        break;
      }
      case 'no-such-device': {
        enum4 = 29;
        break;
      }
      case 'overflow': {
        enum4 = 30;
        break;
      }
      case 'not-permitted': {
        enum4 = 31;
        break;
      }
      case 'pipe': {
        enum4 = 32;
        break;
      }
      case 'read-only': {
        enum4 = 33;
        break;
      }
      case 'invalid-seek': {
        enum4 = 34;
        break;
      }
      case 'text-file-busy': {
        enum4 = 35;
        break;
      }
      case 'cross-device': {
        enum4 = 36;
        break;
      }
      default: {
        if ((e) instanceof Error) {
          console.error(e);
        }
        
        throw new TypeError(`"${val4}" is not one of the cases of error-code`);
      }
    }
    dataView(memory0).setInt8(arg2 + 4, enum4, true);
    
    break;
  }
  default: {
    _debugLog("ERROR: invalid value (expected result as object with 'tag' member)", { value: variant5, valueType: typeof variant5});
    throw new TypeError('invalid variant specified for result');
  }
}
_debugLog('[iface="wasi:filesystem/types@0.2.10", function="[method]descriptor.write-via-stream"][Instruction::Return]', {
  funcName: '[method]descriptor.write-via-stream',
  paramCount: 0,
  async: false,
  postReturn: false
});
task.resolve([ret]);
task.exit();
}
_trampoline72.fnName = 'wasi:filesystem/types@0.2.10#writeViaStream';

const _trampoline73 = function(arg0, arg1) {
  var handle1 = arg0;
  
  var rep2 = handleTable7[(handle1 << 1) + 1] & ~T_FLAG;
  var rsc0 = captureTable7.get(rep2);
  if (!rsc0) {
    rsc0 = Object.create(Descriptor.prototype);
    Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
    Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
  }
  
  curResourceBorrows.push(rsc0);
  _debugLog('[iface="wasi:filesystem/types@0.2.10", function="[method]descriptor.append-via-stream"] [Instruction::CallInterface] (sync, @ enter)');
  const hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1,
      isAsync: false,
      entryFnName: 'appendViaStream',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'result-catch-handler',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(
    0,
    _getGlobalCurrentTaskMeta(0)?.taskID,
    )?.task;
    
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  
  let ret;
  try {
    ret = { tag: 'ok', val: _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => rsc0.appendViaStream(),
    })
  };
} catch (e) {
  ret = { tag: 'err', val: getErrorPayload(e) };
}

for (const rsc of curResourceBorrows) {
  rsc[symbolRscHandle] = undefined;
}
curResourceBorrows = [];
var variant5 = ret;
switch (variant5.tag) {
  case 'ok': {
    const e = variant5.val;
    dataView(memory0).setInt8(arg1 + 0, 0, true);
    
    if (!(e instanceof OutputStream)) {
      throw new TypeError('Resource error: Not a valid \"OutputStream\" resource.');
    }
    var handle3 = e[symbolRscHandle];
    if (!handle3) {
      const rep = e[symbolRscRep] || ++captureCnt4;
      captureTable4.set(rep, e);
      handle3 = rscTableCreateOwn(handleTable4, rep);
    }
    
    dataView(memory0).setInt32(arg1 + 4, handle3, true);
    
    break;
  }
  case 'err': {
    const e = variant5.val;
    dataView(memory0).setInt8(arg1 + 0, 1, true);
    var val4 = e;
    let enum4;
    switch (val4) {
      case 'access': {
        enum4 = 0;
        break;
      }
      case 'would-block': {
        enum4 = 1;
        break;
      }
      case 'already': {
        enum4 = 2;
        break;
      }
      case 'bad-descriptor': {
        enum4 = 3;
        break;
      }
      case 'busy': {
        enum4 = 4;
        break;
      }
      case 'deadlock': {
        enum4 = 5;
        break;
      }
      case 'quota': {
        enum4 = 6;
        break;
      }
      case 'exist': {
        enum4 = 7;
        break;
      }
      case 'file-too-large': {
        enum4 = 8;
        break;
      }
      case 'illegal-byte-sequence': {
        enum4 = 9;
        break;
      }
      case 'in-progress': {
        enum4 = 10;
        break;
      }
      case 'interrupted': {
        enum4 = 11;
        break;
      }
      case 'invalid': {
        enum4 = 12;
        break;
      }
      case 'io': {
        enum4 = 13;
        break;
      }
      case 'is-directory': {
        enum4 = 14;
        break;
      }
      case 'loop': {
        enum4 = 15;
        break;
      }
      case 'too-many-links': {
        enum4 = 16;
        break;
      }
      case 'message-size': {
        enum4 = 17;
        break;
      }
      case 'name-too-long': {
        enum4 = 18;
        break;
      }
      case 'no-device': {
        enum4 = 19;
        break;
      }
      case 'no-entry': {
        enum4 = 20;
        break;
      }
      case 'no-lock': {
        enum4 = 21;
        break;
      }
      case 'insufficient-memory': {
        enum4 = 22;
        break;
      }
      case 'insufficient-space': {
        enum4 = 23;
        break;
      }
      case 'not-directory': {
        enum4 = 24;
        break;
      }
      case 'not-empty': {
        enum4 = 25;
        break;
      }
      case 'not-recoverable': {
        enum4 = 26;
        break;
      }
      case 'unsupported': {
        enum4 = 27;
        break;
      }
      case 'no-tty': {
        enum4 = 28;
        break;
      }
      case 'no-such-device': {
        enum4 = 29;
        break;
      }
      case 'overflow': {
        enum4 = 30;
        break;
      }
      case 'not-permitted': {
        enum4 = 31;
        break;
      }
      case 'pipe': {
        enum4 = 32;
        break;
      }
      case 'read-only': {
        enum4 = 33;
        break;
      }
      case 'invalid-seek': {
        enum4 = 34;
        break;
      }
      case 'text-file-busy': {
        enum4 = 35;
        break;
      }
      case 'cross-device': {
        enum4 = 36;
        break;
      }
      default: {
        if ((e) instanceof Error) {
          console.error(e);
        }
        
        throw new TypeError(`"${val4}" is not one of the cases of error-code`);
      }
    }
    dataView(memory0).setInt8(arg1 + 4, enum4, true);
    
    break;
  }
  default: {
    _debugLog("ERROR: invalid value (expected result as object with 'tag' member)", { value: variant5, valueType: typeof variant5});
    throw new TypeError('invalid variant specified for result');
  }
}
_debugLog('[iface="wasi:filesystem/types@0.2.10", function="[method]descriptor.append-via-stream"][Instruction::Return]', {
  funcName: '[method]descriptor.append-via-stream',
  paramCount: 0,
  async: false,
  postReturn: false
});
task.resolve([ret]);
task.exit();
}
_trampoline73.fnName = 'wasi:filesystem/types@0.2.10#appendViaStream';

const _trampoline74 = function(arg0, arg1) {
  var handle1 = arg0;
  
  var rep2 = handleTable7[(handle1 << 1) + 1] & ~T_FLAG;
  var rsc0 = captureTable7.get(rep2);
  if (!rsc0) {
    rsc0 = Object.create(Descriptor.prototype);
    Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
    Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
  }
  
  curResourceBorrows.push(rsc0);
  _debugLog('[iface="wasi:filesystem/types@0.2.10", function="[method]descriptor.stat"] [Instruction::CallInterface] (sync, @ enter)');
  const hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1,
      isAsync: false,
      entryFnName: 'stat',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'result-catch-handler',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(
    0,
    _getGlobalCurrentTaskMeta(0)?.taskID,
    )?.task;
    
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  
  let ret;
  try {
    ret = { tag: 'ok', val: _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => rsc0.stat(),
    })
  };
} catch (e) {
  ret = { tag: 'err', val: getErrorPayload(e) };
}

for (const rsc of curResourceBorrows) {
  rsc[symbolRscHandle] = undefined;
}
curResourceBorrows = [];
var variant12 = ret;
switch (variant12.tag) {
  case 'ok': {
    const e = variant12.val;
    dataView(memory0).setInt8(arg1 + 0, 0, true);
    var {type: v3_0, linkCount: v3_1, size: v3_2, dataAccessTimestamp: v3_3, dataModificationTimestamp: v3_4, statusChangeTimestamp: v3_5 } = e;
    var val4 = v3_0;
    let enum4;
    switch (val4) {
      case 'unknown': {
        enum4 = 0;
        break;
      }
      case 'block-device': {
        enum4 = 1;
        break;
      }
      case 'character-device': {
        enum4 = 2;
        break;
      }
      case 'directory': {
        enum4 = 3;
        break;
      }
      case 'fifo': {
        enum4 = 4;
        break;
      }
      case 'symbolic-link': {
        enum4 = 5;
        break;
      }
      case 'regular-file': {
        enum4 = 6;
        break;
      }
      case 'socket': {
        enum4 = 7;
        break;
      }
      default: {
        if ((v3_0) instanceof Error) {
          console.error(v3_0);
        }
        
        throw new TypeError(`"${val4}" is not one of the cases of descriptor-type`);
      }
    }
    dataView(memory0).setInt8(arg1 + 8, enum4, true);
    dataView(memory0).setBigInt64(arg1 + 16, toUint64(v3_1), true);
    dataView(memory0).setBigInt64(arg1 + 24, toUint64(v3_2), true);
    var variant6 = v3_3;
    if (variant6 === null || variant6=== undefined) {
      dataView(memory0).setInt8(arg1 + 32, 0, true);
    } else {
      const e = variant6;
      dataView(memory0).setInt8(arg1 + 32, 1, true);
      var {seconds: v5_0, nanoseconds: v5_1 } = e;
      dataView(memory0).setBigInt64(arg1 + 40, toUint64(v5_0), true);
      dataView(memory0).setInt32(arg1 + 48, toUint32(v5_1), true);
    }
    var variant8 = v3_4;
    if (variant8 === null || variant8=== undefined) {
      dataView(memory0).setInt8(arg1 + 56, 0, true);
    } else {
      const e = variant8;
      dataView(memory0).setInt8(arg1 + 56, 1, true);
      var {seconds: v7_0, nanoseconds: v7_1 } = e;
      dataView(memory0).setBigInt64(arg1 + 64, toUint64(v7_0), true);
      dataView(memory0).setInt32(arg1 + 72, toUint32(v7_1), true);
    }
    var variant10 = v3_5;
    if (variant10 === null || variant10=== undefined) {
      dataView(memory0).setInt8(arg1 + 80, 0, true);
    } else {
      const e = variant10;
      dataView(memory0).setInt8(arg1 + 80, 1, true);
      var {seconds: v9_0, nanoseconds: v9_1 } = e;
      dataView(memory0).setBigInt64(arg1 + 88, toUint64(v9_0), true);
      dataView(memory0).setInt32(arg1 + 96, toUint32(v9_1), true);
    }
    
    break;
  }
  case 'err': {
    const e = variant12.val;
    dataView(memory0).setInt8(arg1 + 0, 1, true);
    var val11 = e;
    let enum11;
    switch (val11) {
      case 'access': {
        enum11 = 0;
        break;
      }
      case 'would-block': {
        enum11 = 1;
        break;
      }
      case 'already': {
        enum11 = 2;
        break;
      }
      case 'bad-descriptor': {
        enum11 = 3;
        break;
      }
      case 'busy': {
        enum11 = 4;
        break;
      }
      case 'deadlock': {
        enum11 = 5;
        break;
      }
      case 'quota': {
        enum11 = 6;
        break;
      }
      case 'exist': {
        enum11 = 7;
        break;
      }
      case 'file-too-large': {
        enum11 = 8;
        break;
      }
      case 'illegal-byte-sequence': {
        enum11 = 9;
        break;
      }
      case 'in-progress': {
        enum11 = 10;
        break;
      }
      case 'interrupted': {
        enum11 = 11;
        break;
      }
      case 'invalid': {
        enum11 = 12;
        break;
      }
      case 'io': {
        enum11 = 13;
        break;
      }
      case 'is-directory': {
        enum11 = 14;
        break;
      }
      case 'loop': {
        enum11 = 15;
        break;
      }
      case 'too-many-links': {
        enum11 = 16;
        break;
      }
      case 'message-size': {
        enum11 = 17;
        break;
      }
      case 'name-too-long': {
        enum11 = 18;
        break;
      }
      case 'no-device': {
        enum11 = 19;
        break;
      }
      case 'no-entry': {
        enum11 = 20;
        break;
      }
      case 'no-lock': {
        enum11 = 21;
        break;
      }
      case 'insufficient-memory': {
        enum11 = 22;
        break;
      }
      case 'insufficient-space': {
        enum11 = 23;
        break;
      }
      case 'not-directory': {
        enum11 = 24;
        break;
      }
      case 'not-empty': {
        enum11 = 25;
        break;
      }
      case 'not-recoverable': {
        enum11 = 26;
        break;
      }
      case 'unsupported': {
        enum11 = 27;
        break;
      }
      case 'no-tty': {
        enum11 = 28;
        break;
      }
      case 'no-such-device': {
        enum11 = 29;
        break;
      }
      case 'overflow': {
        enum11 = 30;
        break;
      }
      case 'not-permitted': {
        enum11 = 31;
        break;
      }
      case 'pipe': {
        enum11 = 32;
        break;
      }
      case 'read-only': {
        enum11 = 33;
        break;
      }
      case 'invalid-seek': {
        enum11 = 34;
        break;
      }
      case 'text-file-busy': {
        enum11 = 35;
        break;
      }
      case 'cross-device': {
        enum11 = 36;
        break;
      }
      default: {
        if ((e) instanceof Error) {
          console.error(e);
        }
        
        throw new TypeError(`"${val11}" is not one of the cases of error-code`);
      }
    }
    dataView(memory0).setInt8(arg1 + 8, enum11, true);
    
    break;
  }
  default: {
    _debugLog("ERROR: invalid value (expected result as object with 'tag' member)", { value: variant12, valueType: typeof variant12});
    throw new TypeError('invalid variant specified for result');
  }
}
_debugLog('[iface="wasi:filesystem/types@0.2.10", function="[method]descriptor.stat"][Instruction::Return]', {
  funcName: '[method]descriptor.stat',
  paramCount: 0,
  async: false,
  postReturn: false
});
task.resolve([ret]);
task.exit();
}
_trampoline74.fnName = 'wasi:filesystem/types@0.2.10#stat';

const _trampoline75 = function(arg0, arg1, arg2, arg3) {
  var handle1 = arg0;
  
  var rep2 = handleTable4[(handle1 << 1) + 1] & ~T_FLAG;
  var rsc0 = captureTable4.get(rep2);
  if (!rsc0) {
    rsc0 = Object.create(OutputStream.prototype);
    Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
    Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
  }
  
  curResourceBorrows.push(rsc0);
  var ptr3 = arg1;
  var len3 = arg2;
  var result3 = new Uint8Array(memory0.buffer.slice(ptr3, ptr3 + len3 * 1));
  _debugLog('[iface="wasi:io/streams@0.2.10", function="[method]output-stream.blocking-write-and-flush"] [Instruction::CallInterface] (sync, @ enter)');
  const hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1,
      isAsync: false,
      entryFnName: 'blockingWriteAndFlush',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'result-catch-handler',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(
    0,
    _getGlobalCurrentTaskMeta(0)?.taskID,
    )?.task;
    
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  
  let ret;
  try {
    ret = { tag: 'ok', val: _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => rsc0.blockingWriteAndFlush(result3),
    })
  };
} catch (e) {
  ret = { tag: 'err', val: getErrorPayload(e) };
}

for (const rsc of curResourceBorrows) {
  rsc[symbolRscHandle] = undefined;
}
curResourceBorrows = [];
var variant6 = ret;
switch (variant6.tag) {
  case 'ok': {
    const e = variant6.val;
    dataView(memory0).setInt8(arg3 + 0, 0, true);
    
    break;
  }
  case 'err': {
    const e = variant6.val;
    dataView(memory0).setInt8(arg3 + 0, 1, true);
    var variant5 = e;
    switch (variant5.tag) {
      case 'last-operation-failed': {
        const e = variant5.val;
        dataView(memory0).setInt8(arg3 + 4, 0, true);
        
        if (!(e instanceof Error$1)) {
          throw new TypeError('Resource error: Not a valid \"Error\" resource.');
        }
        var handle4 = e[symbolRscHandle];
        if (!handle4) {
          const rep = e[symbolRscRep] || ++captureCnt1;
          captureTable1.set(rep, e);
          handle4 = rscTableCreateOwn(handleTable1, rep);
        }
        
        dataView(memory0).setInt32(arg3 + 8, handle4, true);
        break;
      }
      case 'closed': {
        dataView(memory0).setInt8(arg3 + 4, 1, true);
        break;
      }
      default: {
        throw new TypeError(`invalid variant tag value \`${JSON.stringify(variant5.tag)}\` (received \`${variant5}\`) specified for \`StreamError\``);
      }
    }
    
    break;
  }
  default: {
    _debugLog("ERROR: invalid value (expected result as object with 'tag' member)", { value: variant6, valueType: typeof variant6});
    throw new TypeError('invalid variant specified for result');
  }
}
_debugLog('[iface="wasi:io/streams@0.2.10", function="[method]output-stream.blocking-write-and-flush"][Instruction::Return]', {
  funcName: '[method]output-stream.blocking-write-and-flush',
  paramCount: 0,
  async: false,
  postReturn: false
});
task.resolve([ret]);
task.exit();
}
_trampoline75.fnName = 'wasi:io/streams@0.2.10#blockingWriteAndFlush';

const _trampoline76 = function(arg0) {
  _debugLog('[iface="wasi:filesystem/preopens@0.2.10", function="get-directories"] [Instruction::CallInterface] (sync, @ enter)');
  const hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1,
      isAsync: false,
      entryFnName: 'getDirectories',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(
    0,
    _getGlobalCurrentTaskMeta(0)?.taskID,
    )?.task;
    
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  
  let ret;
  
  try {
    ret = _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => getDirectories(),
    })
    ;
  } catch (err) {
    
    _debugLog('[Instruction::CallInterface] error during sync call', {
      taskID: task.id(),
      subtaskID: task.getParentSubtask()?.id(),
      err,
    });
    task.setErrored(err);
    task.reject(err);
    task.exit();
    throw err;
    
  }
  
  var vec3 = ret;
  var len3 = vec3.length;
  var result3 = realloc1(0, 0, 4, len3 * 12);
  for (let i = 0; i < vec3.length; i++) {
    const e = vec3[i];
    const base = result3 + i * 12;var [tuple0_0, tuple0_1] = e;
    
    if (!(tuple0_0 instanceof Descriptor)) {
      throw new TypeError('Resource error: Not a valid \"Descriptor\" resource.');
    }
    var handle1 = tuple0_0[symbolRscHandle];
    if (!handle1) {
      const rep = tuple0_0[symbolRscRep] || ++captureCnt7;
      captureTable7.set(rep, tuple0_0);
      handle1 = rscTableCreateOwn(handleTable7, rep);
    }
    
    dataView(memory0).setInt32(base + 0, handle1, true);
    
    var encodeRes = _utf8AllocateAndEncode(tuple0_1, realloc1, memory0);
    var ptr2= encodeRes.ptr;
    var len2 = encodeRes.len;
    
    dataView(memory0).setUint32(base + 8, len2, true);
    dataView(memory0).setUint32(base + 4, ptr2, true);
  }
  dataView(memory0).setUint32(arg0 + 4, len3, true);
  dataView(memory0).setUint32(arg0 + 0, result3, true);
  _debugLog('[iface="wasi:filesystem/preopens@0.2.10", function="get-directories"][Instruction::Return]', {
    funcName: 'get-directories',
    paramCount: 0,
    async: false,
    postReturn: false
  });
  task.resolve([ret]);
  task.exit();
}
_trampoline76.fnName = 'wasi:filesystem/preopens@0.2.10#getDirectories';

const handleTable5 = [T_FLAG, 0];
handleTable5._createdReps = new Set();


const captureTable5= new Map();
let captureCnt5= 0;

HANDLE_TABLES[5] = handleTable5;

const _trampoline77 = function(arg0) {
  _debugLog('[iface="wasi:cli/terminal-stdin@0.2.10", function="get-terminal-stdin"] [Instruction::CallInterface] (sync, @ enter)');
  const hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1,
      isAsync: false,
      entryFnName: 'getTerminalStdin',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(
    0,
    _getGlobalCurrentTaskMeta(0)?.taskID,
    )?.task;
    
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  
  let ret;
  
  try {
    ret = _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => getTerminalStdin(),
    })
    ;
  } catch (err) {
    
    _debugLog('[Instruction::CallInterface] error during sync call', {
      taskID: task.id(),
      subtaskID: task.getParentSubtask()?.id(),
      err,
    });
    task.setErrored(err);
    task.reject(err);
    task.exit();
    throw err;
    
  }
  
  var variant1 = ret;
  if (variant1 === null || variant1=== undefined) {
    dataView(memory0).setInt8(arg0 + 0, 0, true);
  } else {
    const e = variant1;
    dataView(memory0).setInt8(arg0 + 0, 1, true);
    
    if (!(e instanceof TerminalInput)) {
      throw new TypeError('Resource error: Not a valid \"TerminalInput\" resource.');
    }
    var handle0 = e[symbolRscHandle];
    if (!handle0) {
      const rep = e[symbolRscRep] || ++captureCnt5;
      captureTable5.set(rep, e);
      handle0 = rscTableCreateOwn(handleTable5, rep);
    }
    
    dataView(memory0).setInt32(arg0 + 4, handle0, true);
  }
  _debugLog('[iface="wasi:cli/terminal-stdin@0.2.10", function="get-terminal-stdin"][Instruction::Return]', {
    funcName: 'get-terminal-stdin',
    paramCount: 0,
    async: false,
    postReturn: false
  });
  task.resolve([ret]);
  task.exit();
}
_trampoline77.fnName = 'wasi:cli/terminal-stdin@0.2.10#getTerminalStdin';

const handleTable6 = [T_FLAG, 0];
handleTable6._createdReps = new Set();


const captureTable6= new Map();
let captureCnt6= 0;

HANDLE_TABLES[6] = handleTable6;

const _trampoline78 = function(arg0) {
  _debugLog('[iface="wasi:cli/terminal-stdout@0.2.10", function="get-terminal-stdout"] [Instruction::CallInterface] (sync, @ enter)');
  const hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1,
      isAsync: false,
      entryFnName: 'getTerminalStdout',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(
    0,
    _getGlobalCurrentTaskMeta(0)?.taskID,
    )?.task;
    
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  
  let ret;
  
  try {
    ret = _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => getTerminalStdout(),
    })
    ;
  } catch (err) {
    
    _debugLog('[Instruction::CallInterface] error during sync call', {
      taskID: task.id(),
      subtaskID: task.getParentSubtask()?.id(),
      err,
    });
    task.setErrored(err);
    task.reject(err);
    task.exit();
    throw err;
    
  }
  
  var variant1 = ret;
  if (variant1 === null || variant1=== undefined) {
    dataView(memory0).setInt8(arg0 + 0, 0, true);
  } else {
    const e = variant1;
    dataView(memory0).setInt8(arg0 + 0, 1, true);
    
    if (!(e instanceof TerminalOutput)) {
      throw new TypeError('Resource error: Not a valid \"TerminalOutput\" resource.');
    }
    var handle0 = e[symbolRscHandle];
    if (!handle0) {
      const rep = e[symbolRscRep] || ++captureCnt6;
      captureTable6.set(rep, e);
      handle0 = rscTableCreateOwn(handleTable6, rep);
    }
    
    dataView(memory0).setInt32(arg0 + 4, handle0, true);
  }
  _debugLog('[iface="wasi:cli/terminal-stdout@0.2.10", function="get-terminal-stdout"][Instruction::Return]', {
    funcName: 'get-terminal-stdout',
    paramCount: 0,
    async: false,
    postReturn: false
  });
  task.resolve([ret]);
  task.exit();
}
_trampoline78.fnName = 'wasi:cli/terminal-stdout@0.2.10#getTerminalStdout';

const _trampoline79 = function(arg0) {
  _debugLog('[iface="wasi:cli/terminal-stderr@0.2.10", function="get-terminal-stderr"] [Instruction::CallInterface] (sync, @ enter)');
  const hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1,
      isAsync: false,
      entryFnName: 'getTerminalStderr',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(
    0,
    _getGlobalCurrentTaskMeta(0)?.taskID,
    )?.task;
    
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  
  let ret;
  
  try {
    ret = _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => getTerminalStderr(),
    })
    ;
  } catch (err) {
    
    _debugLog('[Instruction::CallInterface] error during sync call', {
      taskID: task.id(),
      subtaskID: task.getParentSubtask()?.id(),
      err,
    });
    task.setErrored(err);
    task.reject(err);
    task.exit();
    throw err;
    
  }
  
  var variant1 = ret;
  if (variant1 === null || variant1=== undefined) {
    dataView(memory0).setInt8(arg0 + 0, 0, true);
  } else {
    const e = variant1;
    dataView(memory0).setInt8(arg0 + 0, 1, true);
    
    if (!(e instanceof TerminalOutput)) {
      throw new TypeError('Resource error: Not a valid \"TerminalOutput\" resource.');
    }
    var handle0 = e[symbolRscHandle];
    if (!handle0) {
      const rep = e[symbolRscRep] || ++captureCnt6;
      captureTable6.set(rep, e);
      handle0 = rscTableCreateOwn(handleTable6, rep);
    }
    
    dataView(memory0).setInt32(arg0 + 4, handle0, true);
  }
  _debugLog('[iface="wasi:cli/terminal-stderr@0.2.10", function="get-terminal-stderr"][Instruction::Return]', {
    funcName: 'get-terminal-stderr',
    paramCount: 0,
    async: false,
    postReturn: false
  });
  task.resolve([ret]);
  task.exit();
}
_trampoline79.fnName = 'wasi:cli/terminal-stderr@0.2.10#getTerminalStderr';
let exports3;
let postReturn0;
let postReturn0Async;
let postReturn1;
let postReturn1Async;
let postReturn2;
let postReturn2Async;
let postReturn3;
let postReturn3Async;
let postReturn4;
let postReturn4Async;
let postReturn5;
let postReturn5Async;
let pluginLifecycleGetManifest;

function getManifest() {
  _debugLog('[iface="canopy:graph/plugin-lifecycle", function="get-manifest"][Instruction::CallWasm] enter', {
    funcName: 'get-manifest',
    paramCount: 0,
    async: false,
    postReturn: true,
  });
  const hostProvided = false;
  
  const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
    componentIdx: 0,
    isAsync: false,
    isManualAsync: false,
    entryFnName: 'pluginLifecycleGetManifest',
    getCallbackFn: () => null,
    callbackFnName: null,
    errHandling: 'none',
    callingWasmExport: true,
  });
  
  const started = task.enterSync();
  
  if (0!== null) {
    task.setReturnMemoryIdx(0);
    task.setReturnMemory(() => memory0());
  }
  
  
  let ret;
  
  try {
    ret =   _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => pluginLifecycleGetManifest(),
    });
  } catch (err) {
    
    _debugLog('[Instruction::CallWasm] error during sync call', {
      taskID: task.id(),
      err,
    });
    task.setErrored(err);
    task.reject(err);
    task.exit();
    throw err;
    
  }
  
  var ptr0 = dataView(memory0).getUint32(ret + 0, true);
  var len0 = dataView(memory0).getUint32(ret + 4, true);
  var result0 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr0, len0));
  var ptr1 = dataView(memory0).getUint32(ret + 8, true);
  var len1 = dataView(memory0).getUint32(ret + 12, true);
  var result1 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr1, len1));
  let variant3;
  switch (dataView(memory0).getUint8(ret + 16, true)) {
    case 0: {
      variant3 = undefined;
      break;
    }
    case 1: {
      var ptr2 = dataView(memory0).getUint32(ret + 20, true);
      var len2 = dataView(memory0).getUint32(ret + 24, true);
      var result2 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr2, len2));
      variant3 = result2;
      break;
    }
    default: {
      throw new TypeError('invalid variant discriminant for option');
    }
  }
  var len5 = dataView(memory0).getUint32(ret + 32, true);
  var base5 = dataView(memory0).getUint32(ret + 28, true);
  var result5 = [];
  for (let i = 0; i < len5; i++) {
    const base = base5 + i * 8;
    var ptr4 = dataView(memory0).getUint32(base + 0, true);
    var len4 = dataView(memory0).getUint32(base + 4, true);
    var result4 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr4, len4));
    result5.push(result4);
  }
  var len10 = dataView(memory0).getUint32(ret + 40, true);
  var base10 = dataView(memory0).getUint32(ret + 36, true);
  var result10 = [];
  for (let i = 0; i < len10; i++) {
    const base = base10 + i * 28;
    var ptr6 = dataView(memory0).getUint32(base + 0, true);
    var len6 = dataView(memory0).getUint32(base + 4, true);
    var result6 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr6, len6));
    var ptr7 = dataView(memory0).getUint32(base + 8, true);
    var len7 = dataView(memory0).getUint32(base + 12, true);
    var result7 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr7, len7));
    let variant9;
    switch (dataView(memory0).getUint8(base + 16, true)) {
      case 0: {
        variant9 = undefined;
        break;
      }
      case 1: {
        var ptr8 = dataView(memory0).getUint32(base + 20, true);
        var len8 = dataView(memory0).getUint32(base + 24, true);
        var result8 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr8, len8));
        variant9 = result8;
        break;
      }
      default: {
        throw new TypeError('invalid variant discriminant for option');
      }
    }
    result10.push({
      label: result6,
      command: result7,
      shortcut: variant9,
    });
  }
  var len15 = dataView(memory0).getUint32(ret + 48, true);
  var base15 = dataView(memory0).getUint32(ret + 44, true);
  var result15 = [];
  for (let i = 0; i < len15; i++) {
    const base = base15 + i * 28;
    var ptr11 = dataView(memory0).getUint32(base + 0, true);
    var len11 = dataView(memory0).getUint32(base + 4, true);
    var result11 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr11, len11));
    var ptr12 = dataView(memory0).getUint32(base + 8, true);
    var len12 = dataView(memory0).getUint32(base + 12, true);
    var result12 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr12, len12));
    let variant14;
    switch (dataView(memory0).getUint8(base + 16, true)) {
      case 0: {
        variant14 = undefined;
        break;
      }
      case 1: {
        var ptr13 = dataView(memory0).getUint32(base + 20, true);
        var len13 = dataView(memory0).getUint32(base + 24, true);
        var result13 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr13, len13));
        variant14 = result13;
        break;
      }
      default: {
        throw new TypeError('invalid variant discriminant for option');
      }
    }
    result15.push({
      id: result11,
      title: result12,
      category: variant14,
    });
  }
  _debugLog('[iface="canopy:graph/plugin-lifecycle", function="get-manifest"][Instruction::Return]', {
    funcName: 'get-manifest',
    paramCount: 1,
    async: false,
    postReturn: true
  });
  task.resolve([{
    name: result0,
    version: result1,
    description: variant3,
    capabilities: result5,
    menuItems: result10,
    commands: result15,
  }]);
  const retCopy = {
    name: result0,
    version: result1,
    description: variant3,
    capabilities: result5,
    menuItems: result10,
    commands: result15,
  };
  
  let cstate = getOrCreateAsyncState(0);
  cstate.mayLeave = false;
  postReturn0(ret);
  cstate.mayLeave = true;
  task.exit();
  return retCopy;
  
}
let pluginLifecycleInitialize;

function initialize() {
  _debugLog('[iface="canopy:graph/plugin-lifecycle", function="initialize"][Instruction::CallWasm] enter', {
    funcName: 'initialize',
    paramCount: 0,
    async: false,
    postReturn: true,
  });
  const hostProvided = false;
  
  const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
    componentIdx: 0,
    isAsync: false,
    isManualAsync: false,
    entryFnName: 'pluginLifecycleInitialize',
    getCallbackFn: () => null,
    callbackFnName: null,
    errHandling: 'throw-result-err',
    callingWasmExport: true,
  });
  
  const started = task.enterSync();
  
  if (0!== null) {
    task.setReturnMemoryIdx(0);
    task.setReturnMemory(() => memory0());
  }
  
  
  let ret;
  
  try {
    ret =   _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => pluginLifecycleInitialize(),
    });
  } catch (err) {
    
    _debugLog('[Instruction::CallWasm] error during sync call', {
      taskID: task.id(),
      err,
    });
    task.setErrored(err);
    task.reject(err);
    task.exit();
    throw err;
    
  }
  
  let variant1;
  switch (dataView(memory0).getUint8(ret + 0, true)) {
    case 0: {
      variant1= {
        tag: 'ok',
        val: undefined
      };
      break;
    }
    case 1: {
      var ptr0 = dataView(memory0).getUint32(ret + 4, true);
      var len0 = dataView(memory0).getUint32(ret + 8, true);
      var result0 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr0, len0));
      variant1= {
        tag: 'err',
        val: result0
      };
      break;
    }
    default: {
      throw new TypeError('invalid variant discriminant for expected');
    }
  }
  _debugLog('[iface="canopy:graph/plugin-lifecycle", function="initialize"][Instruction::Return]', {
    funcName: 'initialize',
    paramCount: 1,
    async: false,
    postReturn: true
  });
  const retCopy = variant1;
  task.resolve([retCopy.val]);
  
  let cstate = getOrCreateAsyncState(0);
  cstate.mayLeave = false;
  postReturn1(ret);
  cstate.mayLeave = true;
  task.exit();
  
  
  
  if (typeof retCopy === 'object' && retCopy.tag === 'err') {
    throw new ComponentError(retCopy.val);
  }
  return retCopy.val;
  
}
let pluginLifecycleShutdown;

function shutdown() {
  _debugLog('[iface="canopy:graph/plugin-lifecycle", function="shutdown"][Instruction::CallWasm] enter', {
    funcName: 'shutdown',
    paramCount: 0,
    async: false,
    postReturn: true,
  });
  const hostProvided = false;
  
  const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
    componentIdx: 0,
    isAsync: false,
    isManualAsync: false,
    entryFnName: 'pluginLifecycleShutdown',
    getCallbackFn: () => null,
    callbackFnName: null,
    errHandling: 'throw-result-err',
    callingWasmExport: true,
  });
  
  const started = task.enterSync();
  
  if (0!== null) {
    task.setReturnMemoryIdx(0);
    task.setReturnMemory(() => memory0());
  }
  
  
  let ret;
  
  try {
    ret =   _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => pluginLifecycleShutdown(),
    });
  } catch (err) {
    
    _debugLog('[Instruction::CallWasm] error during sync call', {
      taskID: task.id(),
      err,
    });
    task.setErrored(err);
    task.reject(err);
    task.exit();
    throw err;
    
  }
  
  let variant1;
  switch (dataView(memory0).getUint8(ret + 0, true)) {
    case 0: {
      variant1= {
        tag: 'ok',
        val: undefined
      };
      break;
    }
    case 1: {
      var ptr0 = dataView(memory0).getUint32(ret + 4, true);
      var len0 = dataView(memory0).getUint32(ret + 8, true);
      var result0 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr0, len0));
      variant1= {
        tag: 'err',
        val: result0
      };
      break;
    }
    default: {
      throw new TypeError('invalid variant discriminant for expected');
    }
  }
  _debugLog('[iface="canopy:graph/plugin-lifecycle", function="shutdown"][Instruction::Return]', {
    funcName: 'shutdown',
    paramCount: 1,
    async: false,
    postReturn: true
  });
  const retCopy = variant1;
  task.resolve([retCopy.val]);
  
  let cstate = getOrCreateAsyncState(0);
  cstate.mayLeave = false;
  postReturn2(ret);
  cstate.mayLeave = true;
  task.exit();
  
  
  
  if (typeof retCopy === 'object' && retCopy.tag === 'err') {
    throw new ComponentError(retCopy.val);
  }
  return retCopy.val;
  
}

const handleTable18 = [T_FLAG, 0];
handleTable18._createdReps = new Set();
const finalizationRegistry18 = finalizationRegistryCreate((handle) => {
  const { rep } = rscTableRemove(handleTable18, handle);
});

HANDLE_TABLES[18] = handleTable18;
let wizardExecutionConstructorWizardSession;

class WizardSession{
  constructor(arg0) {
    
    if (!(arg0 instanceof DraftSessionHandle)) {
      throw new TypeError('Resource error: Not a valid \"DraftSessionHandle\" resource.');
    }
    var handle0 = arg0[symbolRscHandle];
    if (!handle0) {
      const rep = arg0[symbolRscRep] || ++captureCnt0;
      captureTable0.set(rep, arg0);
      handle0 = rscTableCreateOwn(handleTable0, rep);
    }
    
    _debugLog('[iface="canopy:graph/wizard-execution", function="[constructor]wizard-session"][Instruction::CallWasm] enter', {
      funcName: '[constructor]wizard-session',
      paramCount: 1,
      async: false,
      postReturn: true,
    });
    const hostProvided = false;
    
    const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
      componentIdx: 0,
      isAsync: false,
      isManualAsync: false,
      entryFnName: 'wizardExecutionConstructorWizardSession',
      getCallbackFn: () => null,
      callbackFnName: null,
      errHandling: 'none',
      callingWasmExport: true,
    });
    
    const started = task.enterSync();
    
    if (null!== null) {
      task.setReturnMemoryIdx(null);
      task.setReturnMemory(() => null());
    }
    
    
    let ret;
    
    try {
      ret =   _withGlobalCurrentTaskMeta({
        taskID: task.id(),
        componentIdx: task.componentIdx(),
        fn: () => wizardExecutionConstructorWizardSession(handle0),
      });
    } catch (err) {
      
      _debugLog('[Instruction::CallWasm] error during sync call', {
        taskID: task.id(),
        err,
      });
      task.setErrored(err);
      task.reject(err);
      task.exit();
      throw err;
      
    }
    
    var handle2 = ret;
    var rsc1 = new.target === WizardSession ? this : Object.create(WizardSession.prototype);
    Object.defineProperty(rsc1, symbolRscHandle, { writable: true, value: handle2});
    finalizationRegistry18.register(rsc1, handle2, rsc1);
    Object.defineProperty(rsc1, symbolDispose, { writable: true, value: emptyFunc });
    _debugLog('[iface="canopy:graph/wizard-execution", function="[constructor]wizard-session"][Instruction::Return]', {
      funcName: '[constructor]wizard-session',
      paramCount: 1,
      async: false,
      postReturn: true
    });
    task.resolve([rsc1]);
    const retCopy = rsc1;
    
    let cstate = getOrCreateAsyncState(0);
    cstate.mayLeave = false;
    postReturn3(ret);
    cstate.mayLeave = true;
    task.exit();
    return retCopy;
    
  }
}
let wizardExecutionMethodWizardSessionRenderStepSchema;

WizardSession.prototype.renderStepSchema = function renderStepSchema() {
  
  var handle1 = this[symbolRscHandle];
  if (!handle1 || (handleTable18[(handle1 << 1) + 1] & T_FLAG) === 0) {
    throw new TypeError('Resource error: Not a valid \"WizardSession\" resource.');
  }
  var handle0 = handleTable18[(handle1 << 1) + 1] & ~T_FLAG;
  
  _debugLog('[iface="canopy:graph/wizard-execution", function="[method]wizard-session.render-step-schema"][Instruction::CallWasm] enter', {
    funcName: '[method]wizard-session.render-step-schema',
    paramCount: 1,
    async: false,
    postReturn: true,
  });
  const hostProvided = false;
  
  const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
    componentIdx: 0,
    isAsync: false,
    isManualAsync: false,
    entryFnName: 'wizardExecutionMethodWizardSessionRenderStepSchema',
    getCallbackFn: () => null,
    callbackFnName: null,
    errHandling: 'throw-result-err',
    callingWasmExport: true,
  });
  
  const started = task.enterSync();
  
  if (0!== null) {
    task.setReturnMemoryIdx(0);
    task.setReturnMemory(() => memory0());
  }
  
  
  let ret;
  
  try {
    ret =   _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => wizardExecutionMethodWizardSessionRenderStepSchema(handle0),
    });
  } catch (err) {
    
    _debugLog('[Instruction::CallWasm] error during sync call', {
      taskID: task.id(),
      err,
    });
    task.setErrored(err);
    task.reject(err);
    task.exit();
    throw err;
    
  }
  
  let variant23;
  switch (dataView(memory0).getUint8(ret + 0, true)) {
    case 0: {
      var ptr2 = dataView(memory0).getUint32(ret + 4, true);
      var len2 = dataView(memory0).getUint32(ret + 8, true);
      var result2 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr2, len2));
      let variant4;
      switch (dataView(memory0).getUint8(ret + 12, true)) {
        case 0: {
          variant4 = undefined;
          break;
        }
        case 1: {
          var ptr3 = dataView(memory0).getUint32(ret + 16, true);
          var len3 = dataView(memory0).getUint32(ret + 20, true);
          var result3 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr3, len3));
          variant4 = result3;
          break;
        }
        default: {
          throw new TypeError('invalid variant discriminant for option');
        }
      }
      var len20 = dataView(memory0).getUint32(ret + 28, true);
      var base20 = dataView(memory0).getUint32(ret + 24, true);
      var result20 = [];
      for (let i = 0; i < len20; i++) {
        const base = base20 + i * 64;
        var ptr5 = dataView(memory0).getUint32(base + 0, true);
        var len5 = dataView(memory0).getUint32(base + 4, true);
        var result5 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr5, len5));
        var ptr6 = dataView(memory0).getUint32(base + 8, true);
        var len6 = dataView(memory0).getUint32(base + 12, true);
        var result6 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr6, len6));
        let enum7;
        switch (dataView(memory0).getUint8(base + 16, true)) {
          case 0: {
            enum7 = 'text';
            break;
          }
          case 1: {
            enum7 = 'number';
            break;
          }
          case 2: {
            enum7 = 'boolean';
            break;
          }
          case 3: {
            enum7 = 'date';
            break;
          }
          case 4: {
            enum7 = 'node-reference';
            break;
          }
          default: {
            throw new TypeError('invalid discriminant specified for FieldKind');
          }
        }
        var bool8 = dataView(memory0).getUint8(base + 17, true);
        let variant16;
        switch (dataView(memory0).getUint8(base + 24, true)) {
          case 0: {
            variant16 = undefined;
            break;
          }
          case 1: {
            let variant15;
            switch (dataView(memory0).getUint8(base + 32, true)) {
              case 0: {
                var ptr9 = dataView(memory0).getUint32(base + 40, true);
                var len9 = dataView(memory0).getUint32(base + 44, true);
                var result9 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr9, len9));
                variant15= {
                  tag: 'text',
                  val: result9
                };
                break;
              }
              case 1: {
                variant15= {
                  tag: 'integer',
                  val: dataView(memory0).getBigInt64(base + 40, true)
                };
                break;
              }
              case 2: {
                variant15= {
                  tag: 'decimal',
                  val: dataView(memory0).getFloat64(base + 40, true)
                };
                break;
              }
              case 3: {
                var bool10 = dataView(memory0).getUint8(base + 40, true);
                variant15= {
                  tag: 'boolean',
                  val: bool10 == 0 ? false : (bool10 == 1 ? true : throwInvalidBool())
                };
                break;
              }
              case 4: {
                var ptr11 = dataView(memory0).getUint32(base + 40, true);
                var len11 = dataView(memory0).getUint32(base + 44, true);
                var result11 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr11, len11));
                variant15= {
                  tag: 'date-time',
                  val: result11
                };
                break;
              }
              case 5: {
                var ptr12 = dataView(memory0).getUint32(base + 40, true);
                var len12 = dataView(memory0).getUint32(base + 44, true);
                var result12 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr12, len12));
                variant15= {
                  tag: 'node-id',
                  val: result12
                };
                break;
              }
              case 6: {
                var len14 = dataView(memory0).getUint32(base + 44, true);
                var base14 = dataView(memory0).getUint32(base + 40, true);
                var result14 = [];
                for (let i = 0; i < len14; i++) {
                  const base = base14 + i * 8;
                  var ptr13 = dataView(memory0).getUint32(base + 0, true);
                  var len13 = dataView(memory0).getUint32(base + 4, true);
                  var result13 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr13, len13));
                  result14.push(result13);
                }
                variant15= {
                  tag: 'list-of-text',
                  val: result14
                };
                break;
              }
              case 7: {
                variant15= {
                  tag: 'none',
                };
                break;
              }
              default: {
                throw new TypeError('invalid variant discriminant for PropertyValue');
              }
            }
            variant16 = variant15;
            break;
          }
          default: {
            throw new TypeError('invalid variant discriminant for option');
          }
        }
        let variant19;
        switch (dataView(memory0).getUint8(base + 48, true)) {
          case 0: {
            variant19 = undefined;
            break;
          }
          case 1: {
            var len18 = dataView(memory0).getUint32(base + 56, true);
            var base18 = dataView(memory0).getUint32(base + 52, true);
            var result18 = [];
            for (let i = 0; i < len18; i++) {
              const base = base18 + i * 8;
              var ptr17 = dataView(memory0).getUint32(base + 0, true);
              var len17 = dataView(memory0).getUint32(base + 4, true);
              var result17 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr17, len17));
              result18.push(result17);
            }
            variant19 = result18;
            break;
          }
          default: {
            throw new TypeError('invalid variant discriminant for option');
          }
        }
        result20.push({
          name: result5,
          label: result6,
          kind: enum7,
          required: bool8 == 0 ? false : (bool8 == 1 ? true : throwInvalidBool()),
          defaultValue: variant16,
          options: variant19,
        });
      }
      var ptr21 = dataView(memory0).getUint32(ret + 32, true);
      var len21 = dataView(memory0).getUint32(ret + 36, true);
      var result21 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr21, len21));
      variant23= {
        tag: 'ok',
        val: {
          title: result2,
          description: variant4,
          fields: result20,
          submitLabel: result21,
        }
      };
      break;
    }
    case 1: {
      var ptr22 = dataView(memory0).getUint32(ret + 4, true);
      var len22 = dataView(memory0).getUint32(ret + 8, true);
      var result22 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr22, len22));
      variant23= {
        tag: 'err',
        val: result22
      };
      break;
    }
    default: {
      throw new TypeError('invalid variant discriminant for expected');
    }
  }
  _debugLog('[iface="canopy:graph/wizard-execution", function="[method]wizard-session.render-step-schema"][Instruction::Return]', {
    funcName: '[method]wizard-session.render-step-schema',
    paramCount: 1,
    async: false,
    postReturn: true
  });
  const retCopy = variant23;
  task.resolve([retCopy.val]);
  
  let cstate = getOrCreateAsyncState(0);
  cstate.mayLeave = false;
  postReturn4(ret);
  cstate.mayLeave = true;
  task.exit();
  
  
  
  if (typeof retCopy === 'object' && retCopy.tag === 'err') {
    throw new ComponentError(retCopy.val);
  }
  return retCopy.val;
  
};
let wizardExecutionMethodWizardSessionHandleStepSubmission;

WizardSession.prototype.handleStepSubmission = function handleStepSubmission(arg1) {
  
  var handle1 = this[symbolRscHandle];
  if (!handle1 || (handleTable18[(handle1 << 1) + 1] & T_FLAG) === 0) {
    throw new TypeError('Resource error: Not a valid \"WizardSession\" resource.');
  }
  var handle0 = handleTable18[(handle1 << 1) + 1] & ~T_FLAG;
  
  var vec10 = arg1;
  var len10 = vec10.length;
  var result10 = realloc0(0, 0, 8, len10 * 24);
  for (let i = 0; i < vec10.length; i++) {
    const e = vec10[i];
    const base = result10 + i * 24;var {fieldName: v2_0, value: v2_1 } = e;
    
    var encodeRes = _utf8AllocateAndEncode(v2_0, realloc0, memory0);
    var ptr3= encodeRes.ptr;
    var len3 = encodeRes.len;
    
    dataView(memory0).setUint32(base + 4, len3, true);
    dataView(memory0).setUint32(base + 0, ptr3, true);
    var variant9 = v2_1;
    switch (variant9.tag) {
      case 'text': {
        const e = variant9.val;
        dataView(memory0).setInt8(base + 8, 0, true);
        
        var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
        var ptr4= encodeRes.ptr;
        var len4 = encodeRes.len;
        
        dataView(memory0).setUint32(base + 20, len4, true);
        dataView(memory0).setUint32(base + 16, ptr4, true);
        break;
      }
      case 'integer': {
        const e = variant9.val;
        dataView(memory0).setInt8(base + 8, 1, true);
        dataView(memory0).setBigInt64(base + 16, toInt64(e), true);
        break;
      }
      case 'decimal': {
        const e = variant9.val;
        dataView(memory0).setInt8(base + 8, 2, true);
        dataView(memory0).setFloat64(base + 16, +e, true);
        break;
      }
      case 'boolean': {
        const e = variant9.val;
        dataView(memory0).setInt8(base + 8, 3, true);
        dataView(memory0).setInt8(base + 16, e ? 1 : 0, true);
        break;
      }
      case 'date-time': {
        const e = variant9.val;
        dataView(memory0).setInt8(base + 8, 4, true);
        
        var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
        var ptr5= encodeRes.ptr;
        var len5 = encodeRes.len;
        
        dataView(memory0).setUint32(base + 20, len5, true);
        dataView(memory0).setUint32(base + 16, ptr5, true);
        break;
      }
      case 'node-id': {
        const e = variant9.val;
        dataView(memory0).setInt8(base + 8, 5, true);
        
        var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
        var ptr6= encodeRes.ptr;
        var len6 = encodeRes.len;
        
        dataView(memory0).setUint32(base + 20, len6, true);
        dataView(memory0).setUint32(base + 16, ptr6, true);
        break;
      }
      case 'list-of-text': {
        const e = variant9.val;
        dataView(memory0).setInt8(base + 8, 6, true);
        var vec8 = e;
        var len8 = vec8.length;
        var result8 = realloc0(0, 0, 4, len8 * 8);
        for (let i = 0; i < vec8.length; i++) {
          const e = vec8[i];
          const base = result8 + i * 8;
          var encodeRes = _utf8AllocateAndEncode(e, realloc0, memory0);
          var ptr7= encodeRes.ptr;
          var len7 = encodeRes.len;
          
          dataView(memory0).setUint32(base + 4, len7, true);
          dataView(memory0).setUint32(base + 0, ptr7, true);
        }
        dataView(memory0).setUint32(base + 20, len8, true);
        dataView(memory0).setUint32(base + 16, result8, true);
        break;
      }
      case 'none': {
        dataView(memory0).setInt8(base + 8, 7, true);
        break;
      }
      default: {
        throw new TypeError(`invalid variant tag value \`${JSON.stringify(variant9.tag)}\` (received \`${variant9}\`) specified for \`PropertyValue\``);
      }
    }
  }
  _debugLog('[iface="canopy:graph/wizard-execution", function="[method]wizard-session.handle-step-submission"][Instruction::CallWasm] enter', {
    funcName: '[method]wizard-session.handle-step-submission',
    paramCount: 3,
    async: false,
    postReturn: true,
  });
  const hostProvided = false;
  
  const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
    componentIdx: 0,
    isAsync: false,
    isManualAsync: false,
    entryFnName: 'wizardExecutionMethodWizardSessionHandleStepSubmission',
    getCallbackFn: () => null,
    callbackFnName: null,
    errHandling: 'throw-result-err',
    callingWasmExport: true,
  });
  
  const started = task.enterSync();
  
  if (0!== null) {
    task.setReturnMemoryIdx(0);
    task.setReturnMemory(() => memory0());
  }
  
  
  let ret;
  
  try {
    ret =   _withGlobalCurrentTaskMeta({
      taskID: task.id(),
      componentIdx: task.componentIdx(),
      fn: () => wizardExecutionMethodWizardSessionHandleStepSubmission(handle0, result10, len10),
    });
  } catch (err) {
    
    _debugLog('[Instruction::CallWasm] error during sync call', {
      taskID: task.id(),
      err,
    });
    task.setErrored(err);
    task.reject(err);
    task.exit();
    throw err;
    
  }
  
  let variant66;
  switch (dataView(memory0).getUint8(ret + 0, true)) {
    case 0: {
      let variant31;
      switch (dataView(memory0).getUint8(ret + 4, true)) {
        case 0: {
          var ptr11 = dataView(memory0).getUint32(ret + 8, true);
          var len11 = dataView(memory0).getUint32(ret + 12, true);
          var result11 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr11, len11));
          let variant13;
          switch (dataView(memory0).getUint8(ret + 16, true)) {
            case 0: {
              variant13 = undefined;
              break;
            }
            case 1: {
              var ptr12 = dataView(memory0).getUint32(ret + 20, true);
              var len12 = dataView(memory0).getUint32(ret + 24, true);
              var result12 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr12, len12));
              variant13 = result12;
              break;
            }
            default: {
              throw new TypeError('invalid variant discriminant for option');
            }
          }
          var len29 = dataView(memory0).getUint32(ret + 32, true);
          var base29 = dataView(memory0).getUint32(ret + 28, true);
          var result29 = [];
          for (let i = 0; i < len29; i++) {
            const base = base29 + i * 64;
            var ptr14 = dataView(memory0).getUint32(base + 0, true);
            var len14 = dataView(memory0).getUint32(base + 4, true);
            var result14 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr14, len14));
            var ptr15 = dataView(memory0).getUint32(base + 8, true);
            var len15 = dataView(memory0).getUint32(base + 12, true);
            var result15 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr15, len15));
            let enum16;
            switch (dataView(memory0).getUint8(base + 16, true)) {
              case 0: {
                enum16 = 'text';
                break;
              }
              case 1: {
                enum16 = 'number';
                break;
              }
              case 2: {
                enum16 = 'boolean';
                break;
              }
              case 3: {
                enum16 = 'date';
                break;
              }
              case 4: {
                enum16 = 'node-reference';
                break;
              }
              default: {
                throw new TypeError('invalid discriminant specified for FieldKind');
              }
            }
            var bool17 = dataView(memory0).getUint8(base + 17, true);
            let variant25;
            switch (dataView(memory0).getUint8(base + 24, true)) {
              case 0: {
                variant25 = undefined;
                break;
              }
              case 1: {
                let variant24;
                switch (dataView(memory0).getUint8(base + 32, true)) {
                  case 0: {
                    var ptr18 = dataView(memory0).getUint32(base + 40, true);
                    var len18 = dataView(memory0).getUint32(base + 44, true);
                    var result18 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr18, len18));
                    variant24= {
                      tag: 'text',
                      val: result18
                    };
                    break;
                  }
                  case 1: {
                    variant24= {
                      tag: 'integer',
                      val: dataView(memory0).getBigInt64(base + 40, true)
                    };
                    break;
                  }
                  case 2: {
                    variant24= {
                      tag: 'decimal',
                      val: dataView(memory0).getFloat64(base + 40, true)
                    };
                    break;
                  }
                  case 3: {
                    var bool19 = dataView(memory0).getUint8(base + 40, true);
                    variant24= {
                      tag: 'boolean',
                      val: bool19 == 0 ? false : (bool19 == 1 ? true : throwInvalidBool())
                    };
                    break;
                  }
                  case 4: {
                    var ptr20 = dataView(memory0).getUint32(base + 40, true);
                    var len20 = dataView(memory0).getUint32(base + 44, true);
                    var result20 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr20, len20));
                    variant24= {
                      tag: 'date-time',
                      val: result20
                    };
                    break;
                  }
                  case 5: {
                    var ptr21 = dataView(memory0).getUint32(base + 40, true);
                    var len21 = dataView(memory0).getUint32(base + 44, true);
                    var result21 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr21, len21));
                    variant24= {
                      tag: 'node-id',
                      val: result21
                    };
                    break;
                  }
                  case 6: {
                    var len23 = dataView(memory0).getUint32(base + 44, true);
                    var base23 = dataView(memory0).getUint32(base + 40, true);
                    var result23 = [];
                    for (let i = 0; i < len23; i++) {
                      const base = base23 + i * 8;
                      var ptr22 = dataView(memory0).getUint32(base + 0, true);
                      var len22 = dataView(memory0).getUint32(base + 4, true);
                      var result22 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr22, len22));
                      result23.push(result22);
                    }
                    variant24= {
                      tag: 'list-of-text',
                      val: result23
                    };
                    break;
                  }
                  case 7: {
                    variant24= {
                      tag: 'none',
                    };
                    break;
                  }
                  default: {
                    throw new TypeError('invalid variant discriminant for PropertyValue');
                  }
                }
                variant25 = variant24;
                break;
              }
              default: {
                throw new TypeError('invalid variant discriminant for option');
              }
            }
            let variant28;
            switch (dataView(memory0).getUint8(base + 48, true)) {
              case 0: {
                variant28 = undefined;
                break;
              }
              case 1: {
                var len27 = dataView(memory0).getUint32(base + 56, true);
                var base27 = dataView(memory0).getUint32(base + 52, true);
                var result27 = [];
                for (let i = 0; i < len27; i++) {
                  const base = base27 + i * 8;
                  var ptr26 = dataView(memory0).getUint32(base + 0, true);
                  var len26 = dataView(memory0).getUint32(base + 4, true);
                  var result26 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr26, len26));
                  result27.push(result26);
                }
                variant28 = result27;
                break;
              }
              default: {
                throw new TypeError('invalid variant discriminant for option');
              }
            }
            result29.push({
              name: result14,
              label: result15,
              kind: enum16,
              required: bool17 == 0 ? false : (bool17 == 1 ? true : throwInvalidBool()),
              defaultValue: variant25,
              options: variant28,
            });
          }
          var ptr30 = dataView(memory0).getUint32(ret + 36, true);
          var len30 = dataView(memory0).getUint32(ret + 40, true);
          var result30 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr30, len30));
          variant31= {
            tag: 'form',
            val: {
              title: result11,
              description: variant13,
              fields: result29,
              submitLabel: result30,
            }
          };
          break;
        }
        case 1: {
          variant31= {
            tag: 'complete',
          };
          break;
        }
        case 2: {
          variant31= {
            tag: 'cancel',
          };
          break;
        }
        default: {
          throw new TypeError('invalid variant discriminant for StepDestination');
        }
      }
      var len64 = dataView(memory0).getUint32(ret + 48, true);
      var base64 = dataView(memory0).getUint32(ret + 44, true);
      var result64 = [];
      for (let i = 0; i < len64; i++) {
        const base = base64 + i * 64;
        let variant63;
        switch (dataView(memory0).getUint8(base + 0, true)) {
          case 0: {
            var ptr32 = dataView(memory0).getUint32(base + 4, true);
            var len32 = dataView(memory0).getUint32(base + 8, true);
            var result32 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr32, len32));
            var ptr33 = dataView(memory0).getUint32(base + 12, true);
            var len33 = dataView(memory0).getUint32(base + 16, true);
            var result33 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr33, len33));
            var ptr34 = dataView(memory0).getUint32(base + 20, true);
            var len34 = dataView(memory0).getUint32(base + 24, true);
            var result34 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr34, len34));
            var len43 = dataView(memory0).getUint32(base + 32, true);
            var base43 = dataView(memory0).getUint32(base + 28, true);
            var result43 = [];
            for (let i = 0; i < len43; i++) {
              const base = base43 + i * 24;
              var ptr35 = dataView(memory0).getUint32(base + 0, true);
              var len35 = dataView(memory0).getUint32(base + 4, true);
              var result35 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr35, len35));
              let variant42;
              switch (dataView(memory0).getUint8(base + 8, true)) {
                case 0: {
                  var ptr36 = dataView(memory0).getUint32(base + 16, true);
                  var len36 = dataView(memory0).getUint32(base + 20, true);
                  var result36 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr36, len36));
                  variant42= {
                    tag: 'text',
                    val: result36
                  };
                  break;
                }
                case 1: {
                  variant42= {
                    tag: 'integer',
                    val: dataView(memory0).getBigInt64(base + 16, true)
                  };
                  break;
                }
                case 2: {
                  variant42= {
                    tag: 'decimal',
                    val: dataView(memory0).getFloat64(base + 16, true)
                  };
                  break;
                }
                case 3: {
                  var bool37 = dataView(memory0).getUint8(base + 16, true);
                  variant42= {
                    tag: 'boolean',
                    val: bool37 == 0 ? false : (bool37 == 1 ? true : throwInvalidBool())
                  };
                  break;
                }
                case 4: {
                  var ptr38 = dataView(memory0).getUint32(base + 16, true);
                  var len38 = dataView(memory0).getUint32(base + 20, true);
                  var result38 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr38, len38));
                  variant42= {
                    tag: 'date-time',
                    val: result38
                  };
                  break;
                }
                case 5: {
                  var ptr39 = dataView(memory0).getUint32(base + 16, true);
                  var len39 = dataView(memory0).getUint32(base + 20, true);
                  var result39 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr39, len39));
                  variant42= {
                    tag: 'node-id',
                    val: result39
                  };
                  break;
                }
                case 6: {
                  var len41 = dataView(memory0).getUint32(base + 20, true);
                  var base41 = dataView(memory0).getUint32(base + 16, true);
                  var result41 = [];
                  for (let i = 0; i < len41; i++) {
                    const base = base41 + i * 8;
                    var ptr40 = dataView(memory0).getUint32(base + 0, true);
                    var len40 = dataView(memory0).getUint32(base + 4, true);
                    var result40 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr40, len40));
                    result41.push(result40);
                  }
                  variant42= {
                    tag: 'list-of-text',
                    val: result41
                  };
                  break;
                }
                case 7: {
                  variant42= {
                    tag: 'none',
                  };
                  break;
                }
                default: {
                  throw new TypeError('invalid variant discriminant for PropertyValue');
                }
              }
              result43.push({
                name: result35,
                value: variant42,
              });
            }
            var ptr44 = dataView(memory0).getUint32(base + 36, true);
            var len44 = dataView(memory0).getUint32(base + 40, true);
            var result44 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr44, len44));
            var ptr45 = dataView(memory0).getUint32(base + 44, true);
            var len45 = dataView(memory0).getUint32(base + 48, true);
            var result45 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr45, len45));
            let variant47;
            switch (dataView(memory0).getUint8(base + 52, true)) {
              case 0: {
                variant47 = undefined;
                break;
              }
              case 1: {
                var ptr46 = dataView(memory0).getUint32(base + 56, true);
                var len46 = dataView(memory0).getUint32(base + 60, true);
                var result46 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr46, len46));
                variant47 = result46;
                break;
              }
              default: {
                throw new TypeError('invalid variant discriminant for option');
              }
            }
            variant63= {
              tag: 'node-created',
              val: {
                eventId: result32,
                id: result33,
                nodeType: result34,
                properties: result43,
                timestamp: result44,
                deviceId: result45,
                batchId: variant47,
              }
            };
            break;
          }
          case 1: {
            var ptr48 = dataView(memory0).getUint32(base + 4, true);
            var len48 = dataView(memory0).getUint32(base + 8, true);
            var result48 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr48, len48));
            var ptr49 = dataView(memory0).getUint32(base + 12, true);
            var len49 = dataView(memory0).getUint32(base + 16, true);
            var result49 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr49, len49));
            var len58 = dataView(memory0).getUint32(base + 24, true);
            var base58 = dataView(memory0).getUint32(base + 20, true);
            var result58 = [];
            for (let i = 0; i < len58; i++) {
              const base = base58 + i * 24;
              var ptr50 = dataView(memory0).getUint32(base + 0, true);
              var len50 = dataView(memory0).getUint32(base + 4, true);
              var result50 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr50, len50));
              let variant57;
              switch (dataView(memory0).getUint8(base + 8, true)) {
                case 0: {
                  var ptr51 = dataView(memory0).getUint32(base + 16, true);
                  var len51 = dataView(memory0).getUint32(base + 20, true);
                  var result51 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr51, len51));
                  variant57= {
                    tag: 'text',
                    val: result51
                  };
                  break;
                }
                case 1: {
                  variant57= {
                    tag: 'integer',
                    val: dataView(memory0).getBigInt64(base + 16, true)
                  };
                  break;
                }
                case 2: {
                  variant57= {
                    tag: 'decimal',
                    val: dataView(memory0).getFloat64(base + 16, true)
                  };
                  break;
                }
                case 3: {
                  var bool52 = dataView(memory0).getUint8(base + 16, true);
                  variant57= {
                    tag: 'boolean',
                    val: bool52 == 0 ? false : (bool52 == 1 ? true : throwInvalidBool())
                  };
                  break;
                }
                case 4: {
                  var ptr53 = dataView(memory0).getUint32(base + 16, true);
                  var len53 = dataView(memory0).getUint32(base + 20, true);
                  var result53 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr53, len53));
                  variant57= {
                    tag: 'date-time',
                    val: result53
                  };
                  break;
                }
                case 5: {
                  var ptr54 = dataView(memory0).getUint32(base + 16, true);
                  var len54 = dataView(memory0).getUint32(base + 20, true);
                  var result54 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr54, len54));
                  variant57= {
                    tag: 'node-id',
                    val: result54
                  };
                  break;
                }
                case 6: {
                  var len56 = dataView(memory0).getUint32(base + 20, true);
                  var base56 = dataView(memory0).getUint32(base + 16, true);
                  var result56 = [];
                  for (let i = 0; i < len56; i++) {
                    const base = base56 + i * 8;
                    var ptr55 = dataView(memory0).getUint32(base + 0, true);
                    var len55 = dataView(memory0).getUint32(base + 4, true);
                    var result55 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr55, len55));
                    result56.push(result55);
                  }
                  variant57= {
                    tag: 'list-of-text',
                    val: result56
                  };
                  break;
                }
                case 7: {
                  variant57= {
                    tag: 'none',
                  };
                  break;
                }
                default: {
                  throw new TypeError('invalid variant discriminant for PropertyValue');
                }
              }
              result58.push({
                name: result50,
                value: variant57,
              });
            }
            var ptr59 = dataView(memory0).getUint32(base + 28, true);
            var len59 = dataView(memory0).getUint32(base + 32, true);
            var result59 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr59, len59));
            var ptr60 = dataView(memory0).getUint32(base + 36, true);
            var len60 = dataView(memory0).getUint32(base + 40, true);
            var result60 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr60, len60));
            let variant62;
            switch (dataView(memory0).getUint8(base + 44, true)) {
              case 0: {
                variant62 = undefined;
                break;
              }
              case 1: {
                var ptr61 = dataView(memory0).getUint32(base + 48, true);
                var len61 = dataView(memory0).getUint32(base + 52, true);
                var result61 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr61, len61));
                variant62 = result61;
                break;
              }
              default: {
                throw new TypeError('invalid variant discriminant for option');
              }
            }
            variant63= {
              tag: 'node-properties-updated',
              val: {
                eventId: result48,
                id: result49,
                changes: result58,
                timestamp: result59,
                deviceId: result60,
                batchId: variant62,
              }
            };
            break;
          }
          default: {
            throw new TypeError('invalid variant discriminant for DraftEvent');
          }
        }
        result64.push(variant63);
      }
      variant66= {
        tag: 'ok',
        val: {
          nextStep: variant31,
          eventsToStage: result64,
        }
      };
      break;
    }
    case 1: {
      var ptr65 = dataView(memory0).getUint32(ret + 4, true);
      var len65 = dataView(memory0).getUint32(ret + 8, true);
      var result65 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr65, len65));
      variant66= {
        tag: 'err',
        val: result65
      };
      break;
    }
    default: {
      throw new TypeError('invalid variant discriminant for expected');
    }
  }
  _debugLog('[iface="canopy:graph/wizard-execution", function="[method]wizard-session.handle-step-submission"][Instruction::Return]', {
    funcName: '[method]wizard-session.handle-step-submission',
    paramCount: 1,
    async: false,
    postReturn: true
  });
  const retCopy = variant66;
  task.resolve([retCopy.val]);
  
  let cstate = getOrCreateAsyncState(0);
  cstate.mayLeave = false;
  postReturn5(ret);
  cstate.mayLeave = true;
  task.exit();
  
  
  
  if (typeof retCopy === 'object' && retCopy.tag === 'err') {
    throw new ComponentError(retCopy.val);
  }
  return retCopy.val;
  
};
function trampoline0(handle) {
  const handleEntry = rscTableRemove(handleTable2, handle);
  if (handleEntry.own) {
    
    const rsc = captureTable2.get(handleEntry.rep);
    if (rsc) {
      if (rsc[symbolDispose]) rsc[symbolDispose]();
      captureTable2.delete(handleEntry.rep);
    } else if (Pollable[symbolCabiDispose]) {
      Pollable[symbolCabiDispose](handleEntry.rep);
    }
  }
}
function trampoline1(handle) {
  const handleEntry = rscTableRemove(handleTable3, handle);
  if (handleEntry.own) {
    
    const rsc = captureTable3.get(handleEntry.rep);
    if (rsc) {
      if (rsc[symbolDispose]) rsc[symbolDispose]();
      captureTable3.delete(handleEntry.rep);
    } else if (InputStream[symbolCabiDispose]) {
      InputStream[symbolCabiDispose](handleEntry.rep);
    }
  }
}
function trampoline2(handle) {
  const handleEntry = rscTableRemove(handleTable4, handle);
  if (handleEntry.own) {
    
    const rsc = captureTable4.get(handleEntry.rep);
    if (rsc) {
      if (rsc[symbolDispose]) rsc[symbolDispose]();
      captureTable4.delete(handleEntry.rep);
    } else if (OutputStream[symbolCabiDispose]) {
      OutputStream[symbolCabiDispose](handleEntry.rep);
    }
  }
}
let trampoline3 = _trampoline3.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 3,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline3.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 2)],
  resultLowerFns: [],
  hasResultPointer: false,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: null,
  stringEncoding: 'utf8',
  getMemoryFn: () => null,
  getReallocFn: undefined,
  importFn: _trampoline3,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 3,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline3.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 2)],
  resultLowerFns: [],
  hasResultPointer: false,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: null,
  stringEncoding: 'utf8',
  getMemoryFn: () => null,
  getReallocFn: undefined,
  importFn: _trampoline3,
},
);
let trampoline4 = _trampoline4.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 4,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline4.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 3)],
  resultLowerFns: [_lowerFlatOwn({
    componentIdx: 0,
    lowerFn: 
    function lowerImportedOwnedHost_Pollable(obj) {
      if (!(obj instanceof Pollable)) {
        throw new TypeError('Resource error: Not a valid \"Pollable\" resource.');
      }
      let handle = obj[symbolRscHandle];
      if (!handle) {
        const rep = obj[symbolRscRep] || ++captureCnt2;
        captureTable2.set(rep, obj);
        handle = rscTableCreateOwn(handleTable2, rep);
      }
      return handle;
    }
    ,
  })],
  hasResultPointer: false,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: null,
  stringEncoding: 'utf8',
  getMemoryFn: () => null,
  getReallocFn: undefined,
  importFn: _trampoline4,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 4,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline4.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 3)],
  resultLowerFns: [_lowerFlatOwn({
    componentIdx: 0,
    lowerFn: 
    function lowerImportedOwnedHost_Pollable(obj) {
      if (!(obj instanceof Pollable)) {
        throw new TypeError('Resource error: Not a valid \"Pollable\" resource.');
      }
      let handle = obj[symbolRscHandle];
      if (!handle) {
        const rep = obj[symbolRscRep] || ++captureCnt2;
        captureTable2.set(rep, obj);
        handle = rscTableCreateOwn(handleTable2, rep);
      }
      return handle;
    }
    ,
  })],
  hasResultPointer: false,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: null,
  stringEncoding: 'utf8',
  getMemoryFn: () => null,
  getReallocFn: undefined,
  importFn: _trampoline4,
},
);
let trampoline5 = _trampoline5.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 5,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline5.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 4)],
  resultLowerFns: [_lowerFlatOwn({
    componentIdx: 0,
    lowerFn: 
    function lowerImportedOwnedHost_Pollable(obj) {
      if (!(obj instanceof Pollable)) {
        throw new TypeError('Resource error: Not a valid \"Pollable\" resource.');
      }
      let handle = obj[symbolRscHandle];
      if (!handle) {
        const rep = obj[symbolRscRep] || ++captureCnt2;
        captureTable2.set(rep, obj);
        handle = rscTableCreateOwn(handleTable2, rep);
      }
      return handle;
    }
    ,
  })],
  hasResultPointer: false,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: null,
  stringEncoding: 'utf8',
  getMemoryFn: () => null,
  getReallocFn: undefined,
  importFn: _trampoline5,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 5,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline5.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 4)],
  resultLowerFns: [_lowerFlatOwn({
    componentIdx: 0,
    lowerFn: 
    function lowerImportedOwnedHost_Pollable(obj) {
      if (!(obj instanceof Pollable)) {
        throw new TypeError('Resource error: Not a valid \"Pollable\" resource.');
      }
      let handle = obj[symbolRscHandle];
      if (!handle) {
        const rep = obj[symbolRscRep] || ++captureCnt2;
        captureTable2.set(rep, obj);
        handle = rscTableCreateOwn(handleTable2, rep);
      }
      return handle;
    }
    ,
  })],
  hasResultPointer: false,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: null,
  stringEncoding: 'utf8',
  getMemoryFn: () => null,
  getReallocFn: undefined,
  importFn: _trampoline5,
},
);
let trampoline6 = _trampoline6.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 6,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline6.manuallyAsync,
  paramLiftFns: [],
  resultLowerFns: [_lowerFlatU64],
  hasResultPointer: false,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: null,
  stringEncoding: 'utf8',
  getMemoryFn: () => null,
  getReallocFn: undefined,
  importFn: _trampoline6,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 6,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline6.manuallyAsync,
  paramLiftFns: [],
  resultLowerFns: [_lowerFlatU64],
  hasResultPointer: false,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: null,
  stringEncoding: 'utf8',
  getMemoryFn: () => null,
  getReallocFn: undefined,
  importFn: _trampoline6,
},
);
let trampoline7 = _trampoline7.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 7,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline7.manuallyAsync,
  paramLiftFns: [_liftFlatU64],
  resultLowerFns: [_lowerFlatOwn({
    componentIdx: 0,
    lowerFn: 
    function lowerImportedOwnedHost_Pollable(obj) {
      if (!(obj instanceof Pollable)) {
        throw new TypeError('Resource error: Not a valid \"Pollable\" resource.');
      }
      let handle = obj[symbolRscHandle];
      if (!handle) {
        const rep = obj[symbolRscRep] || ++captureCnt2;
        captureTable2.set(rep, obj);
        handle = rscTableCreateOwn(handleTable2, rep);
      }
      return handle;
    }
    ,
  })],
  hasResultPointer: false,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: null,
  stringEncoding: 'utf8',
  getMemoryFn: () => null,
  getReallocFn: undefined,
  importFn: _trampoline7,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 7,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline7.manuallyAsync,
  paramLiftFns: [_liftFlatU64],
  resultLowerFns: [_lowerFlatOwn({
    componentIdx: 0,
    lowerFn: 
    function lowerImportedOwnedHost_Pollable(obj) {
      if (!(obj instanceof Pollable)) {
        throw new TypeError('Resource error: Not a valid \"Pollable\" resource.');
      }
      let handle = obj[symbolRscHandle];
      if (!handle) {
        const rep = obj[symbolRscRep] || ++captureCnt2;
        captureTable2.set(rep, obj);
        handle = rscTableCreateOwn(handleTable2, rep);
      }
      return handle;
    }
    ,
  })],
  hasResultPointer: false,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: null,
  stringEncoding: 'utf8',
  getMemoryFn: () => null,
  getReallocFn: undefined,
  importFn: _trampoline7,
},
);
let trampoline8 = _trampoline8.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 8,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline8.manuallyAsync,
  paramLiftFns: [_liftFlatU64],
  resultLowerFns: [_lowerFlatOwn({
    componentIdx: 0,
    lowerFn: 
    function lowerImportedOwnedHost_Pollable(obj) {
      if (!(obj instanceof Pollable)) {
        throw new TypeError('Resource error: Not a valid \"Pollable\" resource.');
      }
      let handle = obj[symbolRscHandle];
      if (!handle) {
        const rep = obj[symbolRscRep] || ++captureCnt2;
        captureTable2.set(rep, obj);
        handle = rscTableCreateOwn(handleTable2, rep);
      }
      return handle;
    }
    ,
  })],
  hasResultPointer: false,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: null,
  stringEncoding: 'utf8',
  getMemoryFn: () => null,
  getReallocFn: undefined,
  importFn: _trampoline8,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 8,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline8.manuallyAsync,
  paramLiftFns: [_liftFlatU64],
  resultLowerFns: [_lowerFlatOwn({
    componentIdx: 0,
    lowerFn: 
    function lowerImportedOwnedHost_Pollable(obj) {
      if (!(obj instanceof Pollable)) {
        throw new TypeError('Resource error: Not a valid \"Pollable\" resource.');
      }
      let handle = obj[symbolRscHandle];
      if (!handle) {
        const rep = obj[symbolRscRep] || ++captureCnt2;
        captureTable2.set(rep, obj);
        handle = rscTableCreateOwn(handleTable2, rep);
      }
      return handle;
    }
    ,
  })],
  hasResultPointer: false,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: null,
  stringEncoding: 'utf8',
  getMemoryFn: () => null,
  getReallocFn: undefined,
  importFn: _trampoline8,
},
);
let trampoline9 = _trampoline9.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 9,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline9.manuallyAsync,
  paramLiftFns: [],
  resultLowerFns: [_lowerFlatU64],
  hasResultPointer: false,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: null,
  stringEncoding: 'utf8',
  getMemoryFn: () => null,
  getReallocFn: undefined,
  importFn: _trampoline9,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 9,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline9.manuallyAsync,
  paramLiftFns: [],
  resultLowerFns: [_lowerFlatU64],
  hasResultPointer: false,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: null,
  stringEncoding: 'utf8',
  getMemoryFn: () => null,
  getReallocFn: undefined,
  importFn: _trampoline9,
},
);
let trampoline10 = _trampoline10.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 10,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline10.manuallyAsync,
  paramLiftFns: [],
  resultLowerFns: [_lowerFlatOwn({
    componentIdx: 0,
    lowerFn: 
    function lowerImportedOwnedHost_Fields(obj) {
      if (!(obj instanceof Fields)) {
        throw new TypeError('Resource error: Not a valid \"Fields\" resource.');
      }
      let handle = obj[symbolRscHandle];
      if (!handle) {
        const rep = obj[symbolRscRep] || ++captureCnt8;
        captureTable8.set(rep, obj);
        handle = rscTableCreateOwn(handleTable8, rep);
      }
      return handle;
    }
    ,
  })],
  hasResultPointer: false,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: null,
  stringEncoding: 'utf8',
  getMemoryFn: () => null,
  getReallocFn: undefined,
  importFn: _trampoline10,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 10,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline10.manuallyAsync,
  paramLiftFns: [],
  resultLowerFns: [_lowerFlatOwn({
    componentIdx: 0,
    lowerFn: 
    function lowerImportedOwnedHost_Fields(obj) {
      if (!(obj instanceof Fields)) {
        throw new TypeError('Resource error: Not a valid \"Fields\" resource.');
      }
      let handle = obj[symbolRscHandle];
      if (!handle) {
        const rep = obj[symbolRscRep] || ++captureCnt8;
        captureTable8.set(rep, obj);
        handle = rscTableCreateOwn(handleTable8, rep);
      }
      return handle;
    }
    ,
  })],
  hasResultPointer: false,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: null,
  stringEncoding: 'utf8',
  getMemoryFn: () => null,
  getReallocFn: undefined,
  importFn: _trampoline10,
},
);
let trampoline11 = _trampoline11.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 11,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline11.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 8)],
  resultLowerFns: [_lowerFlatOwn({
    componentIdx: 0,
    lowerFn: 
    function lowerImportedOwnedHost_Fields(obj) {
      if (!(obj instanceof Fields)) {
        throw new TypeError('Resource error: Not a valid \"Fields\" resource.');
      }
      let handle = obj[symbolRscHandle];
      if (!handle) {
        const rep = obj[symbolRscRep] || ++captureCnt8;
        captureTable8.set(rep, obj);
        handle = rscTableCreateOwn(handleTable8, rep);
      }
      return handle;
    }
    ,
  })],
  hasResultPointer: false,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: null,
  stringEncoding: 'utf8',
  getMemoryFn: () => null,
  getReallocFn: undefined,
  importFn: _trampoline11,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 11,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline11.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 8)],
  resultLowerFns: [_lowerFlatOwn({
    componentIdx: 0,
    lowerFn: 
    function lowerImportedOwnedHost_Fields(obj) {
      if (!(obj instanceof Fields)) {
        throw new TypeError('Resource error: Not a valid \"Fields\" resource.');
      }
      let handle = obj[symbolRscHandle];
      if (!handle) {
        const rep = obj[symbolRscRep] || ++captureCnt8;
        captureTable8.set(rep, obj);
        handle = rscTableCreateOwn(handleTable8, rep);
      }
      return handle;
    }
    ,
  })],
  hasResultPointer: false,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: null,
  stringEncoding: 'utf8',
  getMemoryFn: () => null,
  getReallocFn: undefined,
  importFn: _trampoline11,
},
);
let trampoline12 = _trampoline12.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 12,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline12.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 9)],
  resultLowerFns: [_lowerFlatOwn({
    componentIdx: 0,
    lowerFn: 
    function lowerImportedOwnedHost_Fields(obj) {
      if (!(obj instanceof Fields)) {
        throw new TypeError('Resource error: Not a valid \"Fields\" resource.');
      }
      let handle = obj[symbolRscHandle];
      if (!handle) {
        const rep = obj[symbolRscRep] || ++captureCnt8;
        captureTable8.set(rep, obj);
        handle = rscTableCreateOwn(handleTable8, rep);
      }
      return handle;
    }
    ,
  })],
  hasResultPointer: false,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: null,
  stringEncoding: 'utf8',
  getMemoryFn: () => null,
  getReallocFn: undefined,
  importFn: _trampoline12,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 12,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline12.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 9)],
  resultLowerFns: [_lowerFlatOwn({
    componentIdx: 0,
    lowerFn: 
    function lowerImportedOwnedHost_Fields(obj) {
      if (!(obj instanceof Fields)) {
        throw new TypeError('Resource error: Not a valid \"Fields\" resource.');
      }
      let handle = obj[symbolRscHandle];
      if (!handle) {
        const rep = obj[symbolRscRep] || ++captureCnt8;
        captureTable8.set(rep, obj);
        handle = rscTableCreateOwn(handleTable8, rep);
      }
      return handle;
    }
    ,
  })],
  hasResultPointer: false,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: null,
  stringEncoding: 'utf8',
  getMemoryFn: () => null,
  getReallocFn: undefined,
  importFn: _trampoline12,
},
);
let trampoline13 = _trampoline13.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 13,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline13.manuallyAsync,
  paramLiftFns: [_liftFlatOwn({
    componentIdx: 0,
    className: Fields,
    createResourceFn: 
    (handle) => {
      const rep = handleTable8[(handle << 1) + 1] & ~T_FLAG;
      let resourceObj = captureTable8.get(rep);
      if (!resourceObj) {
        resourceObj = Object.create(Fields.prototype);
        Object.defineProperty(resourceObj, symbolRscHandle, { writable: true, value: handle });
        Object.defineProperty(resourceObj, symbolRscRep, { writable: true, value: rep });
      } else {
        captureTable8.delete(rep);
      }
      rscTableRemove(handleTable8, handle);
      return resourceObj;
    }
    ,
  })
  ],
  resultLowerFns: [_lowerFlatOwn({
    componentIdx: 0,
    lowerFn: 
    function lowerImportedOwnedHost_OutgoingRequest(obj) {
      if (!(obj instanceof OutgoingRequest)) {
        throw new TypeError('Resource error: Not a valid \"OutgoingRequest\" resource.');
      }
      let handle = obj[symbolRscHandle];
      if (!handle) {
        const rep = obj[symbolRscRep] || ++captureCnt11;
        captureTable11.set(rep, obj);
        handle = rscTableCreateOwn(handleTable11, rep);
      }
      return handle;
    }
    ,
  })],
  hasResultPointer: false,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: null,
  stringEncoding: 'utf8',
  getMemoryFn: () => null,
  getReallocFn: undefined,
  importFn: _trampoline13,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 13,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline13.manuallyAsync,
  paramLiftFns: [_liftFlatOwn({
    componentIdx: 0,
    className: Fields,
    createResourceFn: 
    (handle) => {
      const rep = handleTable8[(handle << 1) + 1] & ~T_FLAG;
      let resourceObj = captureTable8.get(rep);
      if (!resourceObj) {
        resourceObj = Object.create(Fields.prototype);
        Object.defineProperty(resourceObj, symbolRscHandle, { writable: true, value: handle });
        Object.defineProperty(resourceObj, symbolRscRep, { writable: true, value: rep });
      } else {
        captureTable8.delete(rep);
      }
      rscTableRemove(handleTable8, handle);
      return resourceObj;
    }
    ,
  })
  ],
  resultLowerFns: [_lowerFlatOwn({
    componentIdx: 0,
    lowerFn: 
    function lowerImportedOwnedHost_OutgoingRequest(obj) {
      if (!(obj instanceof OutgoingRequest)) {
        throw new TypeError('Resource error: Not a valid \"OutgoingRequest\" resource.');
      }
      let handle = obj[symbolRscHandle];
      if (!handle) {
        const rep = obj[symbolRscRep] || ++captureCnt11;
        captureTable11.set(rep, obj);
        handle = rscTableCreateOwn(handleTable11, rep);
      }
      return handle;
    }
    ,
  })],
  hasResultPointer: false,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: null,
  stringEncoding: 'utf8',
  getMemoryFn: () => null,
  getReallocFn: undefined,
  importFn: _trampoline13,
},
);
let trampoline14 = _trampoline14.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 14,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline14.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 11)],
  resultLowerFns: [_lowerFlatOwn({
    componentIdx: 0,
    lowerFn: 
    function lowerImportedOwnedHost_Fields(obj) {
      if (!(obj instanceof Fields)) {
        throw new TypeError('Resource error: Not a valid \"Fields\" resource.');
      }
      let handle = obj[symbolRscHandle];
      if (!handle) {
        const rep = obj[symbolRscRep] || ++captureCnt8;
        captureTable8.set(rep, obj);
        handle = rscTableCreateOwn(handleTable8, rep);
      }
      return handle;
    }
    ,
  })],
  hasResultPointer: false,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: null,
  stringEncoding: 'utf8',
  getMemoryFn: () => null,
  getReallocFn: undefined,
  importFn: _trampoline14,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 14,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline14.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 11)],
  resultLowerFns: [_lowerFlatOwn({
    componentIdx: 0,
    lowerFn: 
    function lowerImportedOwnedHost_Fields(obj) {
      if (!(obj instanceof Fields)) {
        throw new TypeError('Resource error: Not a valid \"Fields\" resource.');
      }
      let handle = obj[symbolRscHandle];
      if (!handle) {
        const rep = obj[symbolRscRep] || ++captureCnt8;
        captureTable8.set(rep, obj);
        handle = rscTableCreateOwn(handleTable8, rep);
      }
      return handle;
    }
    ,
  })],
  hasResultPointer: false,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: null,
  stringEncoding: 'utf8',
  getMemoryFn: () => null,
  getReallocFn: undefined,
  importFn: _trampoline14,
},
);
let trampoline15 = _trampoline15.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 15,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline15.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 15)],
  resultLowerFns: [_lowerFlatU16],
  hasResultPointer: false,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: null,
  stringEncoding: 'utf8',
  getMemoryFn: () => null,
  getReallocFn: undefined,
  importFn: _trampoline15,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 15,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline15.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 15)],
  resultLowerFns: [_lowerFlatU16],
  hasResultPointer: false,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: null,
  stringEncoding: 'utf8',
  getMemoryFn: () => null,
  getReallocFn: undefined,
  importFn: _trampoline15,
},
);
let trampoline16 = _trampoline16.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 16,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline16.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 15)],
  resultLowerFns: [_lowerFlatOwn({
    componentIdx: 0,
    lowerFn: 
    function lowerImportedOwnedHost_Fields(obj) {
      if (!(obj instanceof Fields)) {
        throw new TypeError('Resource error: Not a valid \"Fields\" resource.');
      }
      let handle = obj[symbolRscHandle];
      if (!handle) {
        const rep = obj[symbolRscRep] || ++captureCnt8;
        captureTable8.set(rep, obj);
        handle = rscTableCreateOwn(handleTable8, rep);
      }
      return handle;
    }
    ,
  })],
  hasResultPointer: false,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: null,
  stringEncoding: 'utf8',
  getMemoryFn: () => null,
  getReallocFn: undefined,
  importFn: _trampoline16,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 16,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline16.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 15)],
  resultLowerFns: [_lowerFlatOwn({
    componentIdx: 0,
    lowerFn: 
    function lowerImportedOwnedHost_Fields(obj) {
      if (!(obj instanceof Fields)) {
        throw new TypeError('Resource error: Not a valid \"Fields\" resource.');
      }
      let handle = obj[symbolRscHandle];
      if (!handle) {
        const rep = obj[symbolRscRep] || ++captureCnt8;
        captureTable8.set(rep, obj);
        handle = rscTableCreateOwn(handleTable8, rep);
      }
      return handle;
    }
    ,
  })],
  hasResultPointer: false,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: null,
  stringEncoding: 'utf8',
  getMemoryFn: () => null,
  getReallocFn: undefined,
  importFn: _trampoline16,
},
);
let trampoline17 = _trampoline17.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 17,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline17.manuallyAsync,
  paramLiftFns: [_liftFlatOwn({
    componentIdx: 0,
    className: Fields,
    createResourceFn: 
    (handle) => {
      const rep = handleTable8[(handle << 1) + 1] & ~T_FLAG;
      let resourceObj = captureTable8.get(rep);
      if (!resourceObj) {
        resourceObj = Object.create(Fields.prototype);
        Object.defineProperty(resourceObj, symbolRscHandle, { writable: true, value: handle });
        Object.defineProperty(resourceObj, symbolRscRep, { writable: true, value: rep });
      } else {
        captureTable8.delete(rep);
      }
      rscTableRemove(handleTable8, handle);
      return resourceObj;
    }
    ,
  })
  ],
  resultLowerFns: [_lowerFlatOwn({
    componentIdx: 0,
    lowerFn: 
    function lowerImportedOwnedHost_OutgoingResponse(obj) {
      if (!(obj instanceof OutgoingResponse)) {
        throw new TypeError('Resource error: Not a valid \"OutgoingResponse\" resource.');
      }
      let handle = obj[symbolRscHandle];
      if (!handle) {
        const rep = obj[symbolRscRep] || ++captureCnt14;
        captureTable14.set(rep, obj);
        handle = rscTableCreateOwn(handleTable14, rep);
      }
      return handle;
    }
    ,
  })],
  hasResultPointer: false,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: null,
  stringEncoding: 'utf8',
  getMemoryFn: () => null,
  getReallocFn: undefined,
  importFn: _trampoline17,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 17,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline17.manuallyAsync,
  paramLiftFns: [_liftFlatOwn({
    componentIdx: 0,
    className: Fields,
    createResourceFn: 
    (handle) => {
      const rep = handleTable8[(handle << 1) + 1] & ~T_FLAG;
      let resourceObj = captureTable8.get(rep);
      if (!resourceObj) {
        resourceObj = Object.create(Fields.prototype);
        Object.defineProperty(resourceObj, symbolRscHandle, { writable: true, value: handle });
        Object.defineProperty(resourceObj, symbolRscRep, { writable: true, value: rep });
      } else {
        captureTable8.delete(rep);
      }
      rscTableRemove(handleTable8, handle);
      return resourceObj;
    }
    ,
  })
  ],
  resultLowerFns: [_lowerFlatOwn({
    componentIdx: 0,
    lowerFn: 
    function lowerImportedOwnedHost_OutgoingResponse(obj) {
      if (!(obj instanceof OutgoingResponse)) {
        throw new TypeError('Resource error: Not a valid \"OutgoingResponse\" resource.');
      }
      let handle = obj[symbolRscHandle];
      if (!handle) {
        const rep = obj[symbolRscRep] || ++captureCnt14;
        captureTable14.set(rep, obj);
        handle = rscTableCreateOwn(handleTable14, rep);
      }
      return handle;
    }
    ,
  })],
  hasResultPointer: false,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: null,
  stringEncoding: 'utf8',
  getMemoryFn: () => null,
  getReallocFn: undefined,
  importFn: _trampoline17,
},
);
let trampoline18 = _trampoline18.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 18,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline18.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 14),_liftFlatU16],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', null, 1, 1, 1 ],
    [ 'err', null, 1, 1, 1 ],
    ],
    variantSize32: 1,
    variantAlign32: 1,
    variantPayloadOffset32: 1,
    variantFlatCount: 1,
  })
  ],
  hasResultPointer: false,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: null,
  stringEncoding: 'utf8',
  getMemoryFn: () => null,
  getReallocFn: undefined,
  importFn: _trampoline18,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 18,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline18.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 14),_liftFlatU16],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', null, 1, 1, 1 ],
    [ 'err', null, 1, 1, 1 ],
    ],
    variantSize32: 1,
    variantAlign32: 1,
    variantPayloadOffset32: 1,
    variantFlatCount: 1,
  })
  ],
  hasResultPointer: false,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: null,
  stringEncoding: 'utf8',
  getMemoryFn: () => null,
  getReallocFn: undefined,
  importFn: _trampoline18,
},
);
let trampoline19 = _trampoline19.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 19,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline19.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 14)],
  resultLowerFns: [_lowerFlatOwn({
    componentIdx: 0,
    lowerFn: 
    function lowerImportedOwnedHost_Fields(obj) {
      if (!(obj instanceof Fields)) {
        throw new TypeError('Resource error: Not a valid \"Fields\" resource.');
      }
      let handle = obj[symbolRscHandle];
      if (!handle) {
        const rep = obj[symbolRscRep] || ++captureCnt8;
        captureTable8.set(rep, obj);
        handle = rscTableCreateOwn(handleTable8, rep);
      }
      return handle;
    }
    ,
  })],
  hasResultPointer: false,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: null,
  stringEncoding: 'utf8',
  getMemoryFn: () => null,
  getReallocFn: undefined,
  importFn: _trampoline19,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 19,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline19.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 14)],
  resultLowerFns: [_lowerFlatOwn({
    componentIdx: 0,
    lowerFn: 
    function lowerImportedOwnedHost_Fields(obj) {
      if (!(obj instanceof Fields)) {
        throw new TypeError('Resource error: Not a valid \"Fields\" resource.');
      }
      let handle = obj[symbolRscHandle];
      if (!handle) {
        const rep = obj[symbolRscRep] || ++captureCnt8;
        captureTable8.set(rep, obj);
        handle = rscTableCreateOwn(handleTable8, rep);
      }
      return handle;
    }
    ,
  })],
  hasResultPointer: false,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: null,
  stringEncoding: 'utf8',
  getMemoryFn: () => null,
  getReallocFn: undefined,
  importFn: _trampoline19,
},
);
let trampoline20 = _trampoline20.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 20,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline20.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 16)],
  resultLowerFns: [_lowerFlatOwn({
    componentIdx: 0,
    lowerFn: 
    function lowerImportedOwnedHost_Pollable(obj) {
      if (!(obj instanceof Pollable)) {
        throw new TypeError('Resource error: Not a valid \"Pollable\" resource.');
      }
      let handle = obj[symbolRscHandle];
      if (!handle) {
        const rep = obj[symbolRscRep] || ++captureCnt2;
        captureTable2.set(rep, obj);
        handle = rscTableCreateOwn(handleTable2, rep);
      }
      return handle;
    }
    ,
  })],
  hasResultPointer: false,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: null,
  stringEncoding: 'utf8',
  getMemoryFn: () => null,
  getReallocFn: undefined,
  importFn: _trampoline20,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 20,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline20.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 16)],
  resultLowerFns: [_lowerFlatOwn({
    componentIdx: 0,
    lowerFn: 
    function lowerImportedOwnedHost_Pollable(obj) {
      if (!(obj instanceof Pollable)) {
        throw new TypeError('Resource error: Not a valid \"Pollable\" resource.');
      }
      let handle = obj[symbolRscHandle];
      if (!handle) {
        const rep = obj[symbolRscRep] || ++captureCnt2;
        captureTable2.set(rep, obj);
        handle = rscTableCreateOwn(handleTable2, rep);
      }
      return handle;
    }
    ,
  })],
  hasResultPointer: false,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: null,
  stringEncoding: 'utf8',
  getMemoryFn: () => null,
  getReallocFn: undefined,
  importFn: _trampoline20,
},
);
const trampoline21 = rscTableCreateOwn.bind(null, handleTable18);
function trampoline22(handle) {
  return handleTable18[(handle << 1) + 1] & ~T_FLAG;
}
function trampoline23(handle) {
  const handleEntry = rscTableRemove(handleTable18, handle);
  if (handleEntry.own) {
    
  }
}
function trampoline24(handle) {
  const handleEntry = rscTableRemove(handleTable0, handle);
  if (handleEntry.own) {
    
    const rsc = captureTable0.get(handleEntry.rep);
    if (rsc) {
      if (rsc[symbolDispose]) rsc[symbolDispose]();
      captureTable0.delete(handleEntry.rep);
    } else if (DraftSessionHandle[symbolCabiDispose]) {
      DraftSessionHandle[symbolCabiDispose](handleEntry.rep);
    }
  }
}
function trampoline25(handle) {
  const handleEntry = rscTableRemove(handleTable1, handle);
  if (handleEntry.own) {
    
    const rsc = captureTable1.get(handleEntry.rep);
    if (rsc) {
      if (rsc[symbolDispose]) rsc[symbolDispose]();
      captureTable1.delete(handleEntry.rep);
    } else if (Error$1[symbolCabiDispose]) {
      Error$1[symbolCabiDispose](handleEntry.rep);
    }
  }
}
function trampoline26(handle) {
  const handleEntry = rscTableRemove(handleTable7, handle);
  if (handleEntry.own) {
    
    const rsc = captureTable7.get(handleEntry.rep);
    if (rsc) {
      if (rsc[symbolDispose]) rsc[symbolDispose]();
      captureTable7.delete(handleEntry.rep);
    } else if (Descriptor[symbolCabiDispose]) {
      Descriptor[symbolCabiDispose](handleEntry.rep);
    }
  }
}
let trampoline27 = _trampoline27.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 27,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline27.manuallyAsync,
  paramLiftFns: [],
  resultLowerFns: [_lowerFlatOwn({
    componentIdx: 0,
    lowerFn: 
    function lowerImportedOwnedHost_OutputStream(obj) {
      if (!(obj instanceof OutputStream)) {
        throw new TypeError('Resource error: Not a valid \"OutputStream\" resource.');
      }
      let handle = obj[symbolRscHandle];
      if (!handle) {
        const rep = obj[symbolRscRep] || ++captureCnt4;
        captureTable4.set(rep, obj);
        handle = rscTableCreateOwn(handleTable4, rep);
      }
      return handle;
    }
    ,
  })],
  hasResultPointer: false,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: null,
  stringEncoding: 'utf8',
  getMemoryFn: () => null,
  getReallocFn: undefined,
  importFn: _trampoline27,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 27,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline27.manuallyAsync,
  paramLiftFns: [],
  resultLowerFns: [_lowerFlatOwn({
    componentIdx: 0,
    lowerFn: 
    function lowerImportedOwnedHost_OutputStream(obj) {
      if (!(obj instanceof OutputStream)) {
        throw new TypeError('Resource error: Not a valid \"OutputStream\" resource.');
      }
      let handle = obj[symbolRscHandle];
      if (!handle) {
        const rep = obj[symbolRscRep] || ++captureCnt4;
        captureTable4.set(rep, obj);
        handle = rscTableCreateOwn(handleTable4, rep);
      }
      return handle;
    }
    ,
  })],
  hasResultPointer: false,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: null,
  stringEncoding: 'utf8',
  getMemoryFn: () => null,
  getReallocFn: undefined,
  importFn: _trampoline27,
},
);
function trampoline28(handle) {
  const handleEntry = rscTableRemove(handleTable5, handle);
  if (handleEntry.own) {
    
    const rsc = captureTable5.get(handleEntry.rep);
    if (rsc) {
      if (rsc[symbolDispose]) rsc[symbolDispose]();
      captureTable5.delete(handleEntry.rep);
    } else if (TerminalInput[symbolCabiDispose]) {
      TerminalInput[symbolCabiDispose](handleEntry.rep);
    }
  }
}
function trampoline29(handle) {
  const handleEntry = rscTableRemove(handleTable6, handle);
  if (handleEntry.own) {
    
    const rsc = captureTable6.get(handleEntry.rep);
    if (rsc) {
      if (rsc[symbolDispose]) rsc[symbolDispose]();
      captureTable6.delete(handleEntry.rep);
    } else if (TerminalOutput[symbolCabiDispose]) {
      TerminalOutput[symbolCabiDispose](handleEntry.rep);
    }
  }
}
let trampoline30 = _trampoline30.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 30,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline30.manuallyAsync,
  paramLiftFns: [],
  resultLowerFns: [_lowerFlatOwn({
    componentIdx: 0,
    lowerFn: 
    function lowerImportedOwnedHost_InputStream(obj) {
      if (!(obj instanceof InputStream)) {
        throw new TypeError('Resource error: Not a valid \"InputStream\" resource.');
      }
      let handle = obj[symbolRscHandle];
      if (!handle) {
        const rep = obj[symbolRscRep] || ++captureCnt3;
        captureTable3.set(rep, obj);
        handle = rscTableCreateOwn(handleTable3, rep);
      }
      return handle;
    }
    ,
  })],
  hasResultPointer: false,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: null,
  stringEncoding: 'utf8',
  getMemoryFn: () => null,
  getReallocFn: undefined,
  importFn: _trampoline30,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 30,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline30.manuallyAsync,
  paramLiftFns: [],
  resultLowerFns: [_lowerFlatOwn({
    componentIdx: 0,
    lowerFn: 
    function lowerImportedOwnedHost_InputStream(obj) {
      if (!(obj instanceof InputStream)) {
        throw new TypeError('Resource error: Not a valid \"InputStream\" resource.');
      }
      let handle = obj[symbolRscHandle];
      if (!handle) {
        const rep = obj[symbolRscRep] || ++captureCnt3;
        captureTable3.set(rep, obj);
        handle = rscTableCreateOwn(handleTable3, rep);
      }
      return handle;
    }
    ,
  })],
  hasResultPointer: false,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: null,
  stringEncoding: 'utf8',
  getMemoryFn: () => null,
  getReallocFn: undefined,
  importFn: _trampoline30,
},
);
let trampoline31 = _trampoline31.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 31,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline31.manuallyAsync,
  paramLiftFns: [],
  resultLowerFns: [_lowerFlatOwn({
    componentIdx: 0,
    lowerFn: 
    function lowerImportedOwnedHost_OutputStream(obj) {
      if (!(obj instanceof OutputStream)) {
        throw new TypeError('Resource error: Not a valid \"OutputStream\" resource.');
      }
      let handle = obj[symbolRscHandle];
      if (!handle) {
        const rep = obj[symbolRscRep] || ++captureCnt4;
        captureTable4.set(rep, obj);
        handle = rscTableCreateOwn(handleTable4, rep);
      }
      return handle;
    }
    ,
  })],
  hasResultPointer: false,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: null,
  stringEncoding: 'utf8',
  getMemoryFn: () => null,
  getReallocFn: undefined,
  importFn: _trampoline31,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 31,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline31.manuallyAsync,
  paramLiftFns: [],
  resultLowerFns: [_lowerFlatOwn({
    componentIdx: 0,
    lowerFn: 
    function lowerImportedOwnedHost_OutputStream(obj) {
      if (!(obj instanceof OutputStream)) {
        throw new TypeError('Resource error: Not a valid \"OutputStream\" resource.');
      }
      let handle = obj[symbolRscHandle];
      if (!handle) {
        const rep = obj[symbolRscRep] || ++captureCnt4;
        captureTable4.set(rep, obj);
        handle = rscTableCreateOwn(handleTable4, rep);
      }
      return handle;
    }
    ,
  })],
  hasResultPointer: false,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: null,
  stringEncoding: 'utf8',
  getMemoryFn: () => null,
  getReallocFn: undefined,
  importFn: _trampoline31,
},
);
let trampoline32 = _trampoline32.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 32,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline32.manuallyAsync,
  paramLiftFns: [_liftFlatList({
    elemLiftFn: _liftFlatBorrow.bind(null, 2),
    elemAlign32: 4,
    elemSize32: 4,
    typedArray: undefined,
  })],
  resultLowerFns: [_lowerFlatList({
    elemLowerFn: _lowerFlatU32,
    elemSize32: 4,
    elemAlign32: 4,
  })],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: () => realloc0,
  importFn: _trampoline32,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 32,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline32.manuallyAsync,
  paramLiftFns: [_liftFlatList({
    elemLiftFn: _liftFlatBorrow.bind(null, 2),
    elemAlign32: 4,
    elemSize32: 4,
    typedArray: undefined,
  })],
  resultLowerFns: [_lowerFlatList({
    elemLowerFn: _lowerFlatU32,
    elemSize32: 4,
    elemAlign32: 4,
  })],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: () => realloc0,
  importFn: _trampoline32,
},
);
let trampoline33 = _trampoline33.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 33,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline33.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 3),_liftFlatU64],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', _lowerFlatList({
      elemLowerFn: _lowerFlatU8,
      elemSize32: 1,
      elemAlign32: 1,
    }), 12, 4, 4 ],
    [ 'err', _lowerFlatVariant({
      caseMetas: [[ 'last-operation-failed', _lowerFlatOwn({
        componentIdx: 0,
        lowerFn: 
        function lowerImportedOwnedHost_Error$1(obj) {
          if (!(obj instanceof Error$1)) {
            throw new TypeError('Resource error: Not a valid \"Error$1\" resource.');
          }
          let handle = obj[symbolRscHandle];
          if (!handle) {
            const rep = obj[symbolRscRep] || ++captureCnt1;
            captureTable1.set(rep, obj);
            handle = rscTableCreateOwn(handleTable1, rep);
          }
          return handle;
        }
        ,
      }), 4, 4, 1 ],[ 'closed', null, 0, 0, 0 ],],
      variantSize32: 8,
      variantAlign32: 4,
      variantPayloadOffset32: 4,
      variantFlatCount: 2,
    } ), 12, 4, 4 ],
    ],
    variantSize32: 12,
    variantAlign32: 4,
    variantPayloadOffset32: 4,
    variantFlatCount: 3,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: () => realloc0,
  importFn: _trampoline33,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 33,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline33.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 3),_liftFlatU64],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', _lowerFlatList({
      elemLowerFn: _lowerFlatU8,
      elemSize32: 1,
      elemAlign32: 1,
    }), 12, 4, 4 ],
    [ 'err', _lowerFlatVariant({
      caseMetas: [[ 'last-operation-failed', _lowerFlatOwn({
        componentIdx: 0,
        lowerFn: 
        function lowerImportedOwnedHost_Error$1(obj) {
          if (!(obj instanceof Error$1)) {
            throw new TypeError('Resource error: Not a valid \"Error$1\" resource.');
          }
          let handle = obj[symbolRscHandle];
          if (!handle) {
            const rep = obj[symbolRscRep] || ++captureCnt1;
            captureTable1.set(rep, obj);
            handle = rscTableCreateOwn(handleTable1, rep);
          }
          return handle;
        }
        ,
      }), 4, 4, 1 ],[ 'closed', null, 0, 0, 0 ],],
      variantSize32: 8,
      variantAlign32: 4,
      variantPayloadOffset32: 4,
      variantFlatCount: 2,
    } ), 12, 4, 4 ],
    ],
    variantSize32: 12,
    variantAlign32: 4,
    variantPayloadOffset32: 4,
    variantFlatCount: 3,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: () => realloc0,
  importFn: _trampoline33,
},
);
let trampoline34 = _trampoline34.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 34,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline34.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 3),_liftFlatU64],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', _lowerFlatList({
      elemLowerFn: _lowerFlatU8,
      elemSize32: 1,
      elemAlign32: 1,
    }), 12, 4, 4 ],
    [ 'err', _lowerFlatVariant({
      caseMetas: [[ 'last-operation-failed', _lowerFlatOwn({
        componentIdx: 0,
        lowerFn: 
        function lowerImportedOwnedHost_Error$1(obj) {
          if (!(obj instanceof Error$1)) {
            throw new TypeError('Resource error: Not a valid \"Error$1\" resource.');
          }
          let handle = obj[symbolRscHandle];
          if (!handle) {
            const rep = obj[symbolRscRep] || ++captureCnt1;
            captureTable1.set(rep, obj);
            handle = rscTableCreateOwn(handleTable1, rep);
          }
          return handle;
        }
        ,
      }), 4, 4, 1 ],[ 'closed', null, 0, 0, 0 ],],
      variantSize32: 8,
      variantAlign32: 4,
      variantPayloadOffset32: 4,
      variantFlatCount: 2,
    } ), 12, 4, 4 ],
    ],
    variantSize32: 12,
    variantAlign32: 4,
    variantPayloadOffset32: 4,
    variantFlatCount: 3,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: () => realloc0,
  importFn: _trampoline34,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 34,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline34.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 3),_liftFlatU64],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', _lowerFlatList({
      elemLowerFn: _lowerFlatU8,
      elemSize32: 1,
      elemAlign32: 1,
    }), 12, 4, 4 ],
    [ 'err', _lowerFlatVariant({
      caseMetas: [[ 'last-operation-failed', _lowerFlatOwn({
        componentIdx: 0,
        lowerFn: 
        function lowerImportedOwnedHost_Error$1(obj) {
          if (!(obj instanceof Error$1)) {
            throw new TypeError('Resource error: Not a valid \"Error$1\" resource.');
          }
          let handle = obj[symbolRscHandle];
          if (!handle) {
            const rep = obj[symbolRscRep] || ++captureCnt1;
            captureTable1.set(rep, obj);
            handle = rscTableCreateOwn(handleTable1, rep);
          }
          return handle;
        }
        ,
      }), 4, 4, 1 ],[ 'closed', null, 0, 0, 0 ],],
      variantSize32: 8,
      variantAlign32: 4,
      variantPayloadOffset32: 4,
      variantFlatCount: 2,
    } ), 12, 4, 4 ],
    ],
    variantSize32: 12,
    variantAlign32: 4,
    variantPayloadOffset32: 4,
    variantFlatCount: 3,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: () => realloc0,
  importFn: _trampoline34,
},
);
let trampoline35 = _trampoline35.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 35,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline35.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 4)],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', _lowerFlatU64, 16, 8, 8 ],
    [ 'err', _lowerFlatVariant({
      caseMetas: [[ 'last-operation-failed', _lowerFlatOwn({
        componentIdx: 0,
        lowerFn: 
        function lowerImportedOwnedHost_Error$1(obj) {
          if (!(obj instanceof Error$1)) {
            throw new TypeError('Resource error: Not a valid \"Error$1\" resource.');
          }
          let handle = obj[symbolRscHandle];
          if (!handle) {
            const rep = obj[symbolRscRep] || ++captureCnt1;
            captureTable1.set(rep, obj);
            handle = rscTableCreateOwn(handleTable1, rep);
          }
          return handle;
        }
        ,
      }), 4, 4, 1 ],[ 'closed', null, 0, 0, 0 ],],
      variantSize32: 8,
      variantAlign32: 4,
      variantPayloadOffset32: 4,
      variantFlatCount: 2,
    } ), 16, 8, 8 ],
    ],
    variantSize32: 16,
    variantAlign32: 8,
    variantPayloadOffset32: 8,
    variantFlatCount: 3,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline35,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 35,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline35.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 4)],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', _lowerFlatU64, 16, 8, 8 ],
    [ 'err', _lowerFlatVariant({
      caseMetas: [[ 'last-operation-failed', _lowerFlatOwn({
        componentIdx: 0,
        lowerFn: 
        function lowerImportedOwnedHost_Error$1(obj) {
          if (!(obj instanceof Error$1)) {
            throw new TypeError('Resource error: Not a valid \"Error$1\" resource.');
          }
          let handle = obj[symbolRscHandle];
          if (!handle) {
            const rep = obj[symbolRscRep] || ++captureCnt1;
            captureTable1.set(rep, obj);
            handle = rscTableCreateOwn(handleTable1, rep);
          }
          return handle;
        }
        ,
      }), 4, 4, 1 ],[ 'closed', null, 0, 0, 0 ],],
      variantSize32: 8,
      variantAlign32: 4,
      variantPayloadOffset32: 4,
      variantFlatCount: 2,
    } ), 16, 8, 8 ],
    ],
    variantSize32: 16,
    variantAlign32: 8,
    variantPayloadOffset32: 8,
    variantFlatCount: 3,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline35,
},
);
let trampoline36 = _trampoline36.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 36,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline36.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 4),_liftFlatList({
    elemLiftFn: _liftFlatU8,
    elemAlign32: 1,
    elemSize32: 1,
    typedArray: Uint8Array,
  })],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', null, 12, 4, 4 ],
    [ 'err', _lowerFlatVariant({
      caseMetas: [[ 'last-operation-failed', _lowerFlatOwn({
        componentIdx: 0,
        lowerFn: 
        function lowerImportedOwnedHost_Error$1(obj) {
          if (!(obj instanceof Error$1)) {
            throw new TypeError('Resource error: Not a valid \"Error$1\" resource.');
          }
          let handle = obj[symbolRscHandle];
          if (!handle) {
            const rep = obj[symbolRscRep] || ++captureCnt1;
            captureTable1.set(rep, obj);
            handle = rscTableCreateOwn(handleTable1, rep);
          }
          return handle;
        }
        ,
      }), 4, 4, 1 ],[ 'closed', null, 0, 0, 0 ],],
      variantSize32: 8,
      variantAlign32: 4,
      variantPayloadOffset32: 4,
      variantFlatCount: 2,
    } ), 12, 4, 4 ],
    ],
    variantSize32: 12,
    variantAlign32: 4,
    variantPayloadOffset32: 4,
    variantFlatCount: 3,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline36,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 36,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline36.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 4),_liftFlatList({
    elemLiftFn: _liftFlatU8,
    elemAlign32: 1,
    elemSize32: 1,
    typedArray: Uint8Array,
  })],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', null, 12, 4, 4 ],
    [ 'err', _lowerFlatVariant({
      caseMetas: [[ 'last-operation-failed', _lowerFlatOwn({
        componentIdx: 0,
        lowerFn: 
        function lowerImportedOwnedHost_Error$1(obj) {
          if (!(obj instanceof Error$1)) {
            throw new TypeError('Resource error: Not a valid \"Error$1\" resource.');
          }
          let handle = obj[symbolRscHandle];
          if (!handle) {
            const rep = obj[symbolRscRep] || ++captureCnt1;
            captureTable1.set(rep, obj);
            handle = rscTableCreateOwn(handleTable1, rep);
          }
          return handle;
        }
        ,
      }), 4, 4, 1 ],[ 'closed', null, 0, 0, 0 ],],
      variantSize32: 8,
      variantAlign32: 4,
      variantPayloadOffset32: 4,
      variantFlatCount: 2,
    } ), 12, 4, 4 ],
    ],
    variantSize32: 12,
    variantAlign32: 4,
    variantPayloadOffset32: 4,
    variantFlatCount: 3,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline36,
},
);
let trampoline37 = _trampoline37.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 37,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline37.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 4)],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', null, 12, 4, 4 ],
    [ 'err', _lowerFlatVariant({
      caseMetas: [[ 'last-operation-failed', _lowerFlatOwn({
        componentIdx: 0,
        lowerFn: 
        function lowerImportedOwnedHost_Error$1(obj) {
          if (!(obj instanceof Error$1)) {
            throw new TypeError('Resource error: Not a valid \"Error$1\" resource.');
          }
          let handle = obj[symbolRscHandle];
          if (!handle) {
            const rep = obj[symbolRscRep] || ++captureCnt1;
            captureTable1.set(rep, obj);
            handle = rscTableCreateOwn(handleTable1, rep);
          }
          return handle;
        }
        ,
      }), 4, 4, 1 ],[ 'closed', null, 0, 0, 0 ],],
      variantSize32: 8,
      variantAlign32: 4,
      variantPayloadOffset32: 4,
      variantFlatCount: 2,
    } ), 12, 4, 4 ],
    ],
    variantSize32: 12,
    variantAlign32: 4,
    variantPayloadOffset32: 4,
    variantFlatCount: 3,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline37,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 37,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline37.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 4)],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', null, 12, 4, 4 ],
    [ 'err', _lowerFlatVariant({
      caseMetas: [[ 'last-operation-failed', _lowerFlatOwn({
        componentIdx: 0,
        lowerFn: 
        function lowerImportedOwnedHost_Error$1(obj) {
          if (!(obj instanceof Error$1)) {
            throw new TypeError('Resource error: Not a valid \"Error$1\" resource.');
          }
          let handle = obj[symbolRscHandle];
          if (!handle) {
            const rep = obj[symbolRscRep] || ++captureCnt1;
            captureTable1.set(rep, obj);
            handle = rscTableCreateOwn(handleTable1, rep);
          }
          return handle;
        }
        ,
      }), 4, 4, 1 ],[ 'closed', null, 0, 0, 0 ],],
      variantSize32: 8,
      variantAlign32: 4,
      variantPayloadOffset32: 4,
      variantFlatCount: 2,
    } ), 12, 4, 4 ],
    ],
    variantSize32: 12,
    variantAlign32: 4,
    variantPayloadOffset32: 4,
    variantFlatCount: 3,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline37,
},
);
let trampoline38 = _trampoline38.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 38,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline38.manuallyAsync,
  paramLiftFns: [_liftFlatU64],
  resultLowerFns: [_lowerFlatList({
    elemLowerFn: _lowerFlatU8,
    elemSize32: 1,
    elemAlign32: 1,
  })],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: () => realloc0,
  importFn: _trampoline38,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 38,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline38.manuallyAsync,
  paramLiftFns: [_liftFlatU64],
  resultLowerFns: [_lowerFlatList({
    elemLowerFn: _lowerFlatU8,
    elemSize32: 1,
    elemAlign32: 1,
  })],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: () => realloc0,
  importFn: _trampoline38,
},
);
let trampoline39 = _trampoline39.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 39,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline39.manuallyAsync,
  paramLiftFns: [_liftFlatList({
    elemLiftFn: _liftFlatTuple({ elemLiftFns: [[_liftFlatStringAny, 8, 4],[_liftFlatList({
      elemLiftFn: _liftFlatU8,
      elemAlign32: 1,
      elemSize32: 1,
      typedArray: Uint8Array,
    }), 8, 4],], size32: 16, align32: 4 }),
    elemAlign32: 4,
    elemSize32: 16,
    typedArray: undefined,
  })],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', _lowerFlatOwn({
      componentIdx: 0,
      lowerFn: 
      function lowerImportedOwnedHost_Fields(obj) {
        if (!(obj instanceof Fields)) {
          throw new TypeError('Resource error: Not a valid \"Fields\" resource.');
        }
        let handle = obj[symbolRscHandle];
        if (!handle) {
          const rep = obj[symbolRscRep] || ++captureCnt8;
          captureTable8.set(rep, obj);
          handle = rscTableCreateOwn(handleTable8, rep);
        }
        return handle;
      }
      ,
    }), 8, 4, 4 ],
    [ 'err', _lowerFlatVariant({
      caseMetas: [[ 'invalid-syntax', null, 0, 0, 0 ],[ 'forbidden', null, 0, 0, 0 ],[ 'immutable', null, 0, 0, 0 ],],
      variantSize32: 1,
      variantAlign32: 1,
      variantPayloadOffset32: 1,
      variantFlatCount: 1,
    } ), 8, 4, 4 ],
    ],
    variantSize32: 8,
    variantAlign32: 4,
    variantPayloadOffset32: 4,
    variantFlatCount: 2,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline39,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 39,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline39.manuallyAsync,
  paramLiftFns: [_liftFlatList({
    elemLiftFn: _liftFlatTuple({ elemLiftFns: [[_liftFlatStringAny, 8, 4],[_liftFlatList({
      elemLiftFn: _liftFlatU8,
      elemAlign32: 1,
      elemSize32: 1,
      typedArray: Uint8Array,
    }), 8, 4],], size32: 16, align32: 4 }),
    elemAlign32: 4,
    elemSize32: 16,
    typedArray: undefined,
  })],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', _lowerFlatOwn({
      componentIdx: 0,
      lowerFn: 
      function lowerImportedOwnedHost_Fields(obj) {
        if (!(obj instanceof Fields)) {
          throw new TypeError('Resource error: Not a valid \"Fields\" resource.');
        }
        let handle = obj[symbolRscHandle];
        if (!handle) {
          const rep = obj[symbolRscRep] || ++captureCnt8;
          captureTable8.set(rep, obj);
          handle = rscTableCreateOwn(handleTable8, rep);
        }
        return handle;
      }
      ,
    }), 8, 4, 4 ],
    [ 'err', _lowerFlatVariant({
      caseMetas: [[ 'invalid-syntax', null, 0, 0, 0 ],[ 'forbidden', null, 0, 0, 0 ],[ 'immutable', null, 0, 0, 0 ],],
      variantSize32: 1,
      variantAlign32: 1,
      variantPayloadOffset32: 1,
      variantFlatCount: 1,
    } ), 8, 4, 4 ],
    ],
    variantSize32: 8,
    variantAlign32: 4,
    variantPayloadOffset32: 4,
    variantFlatCount: 2,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline39,
},
);
let trampoline40 = _trampoline40.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 40,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline40.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 8),_liftFlatStringAny],
  resultLowerFns: [_lowerFlatList({
    elemLowerFn: _lowerFlatList({
      elemLowerFn: _lowerFlatU8,
      elemSize32: 1,
      elemAlign32: 1,
    }),
    elemSize32: 8,
    elemAlign32: 4,
  })],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: () => realloc0,
  importFn: _trampoline40,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 40,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline40.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 8),_liftFlatStringAny],
  resultLowerFns: [_lowerFlatList({
    elemLowerFn: _lowerFlatList({
      elemLowerFn: _lowerFlatU8,
      elemSize32: 1,
      elemAlign32: 1,
    }),
    elemSize32: 8,
    elemAlign32: 4,
  })],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: () => realloc0,
  importFn: _trampoline40,
},
);
let trampoline41 = _trampoline41.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 41,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline41.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 8),_liftFlatStringAny],
  resultLowerFns: [_lowerFlatBool],
  hasResultPointer: false,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline41,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 41,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline41.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 8),_liftFlatStringAny],
  resultLowerFns: [_lowerFlatBool],
  hasResultPointer: false,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline41,
},
);
let trampoline42 = _trampoline42.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 42,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline42.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 8),_liftFlatStringAny,_liftFlatList({
    elemLiftFn: _liftFlatList({
      elemLiftFn: _liftFlatU8,
      elemAlign32: 1,
      elemSize32: 1,
      typedArray: Uint8Array,
    }),
    elemAlign32: 4,
    elemSize32: 8,
    typedArray: undefined,
  })],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', null, 2, 1, 1 ],
    [ 'err', _lowerFlatVariant({
      caseMetas: [[ 'invalid-syntax', null, 0, 0, 0 ],[ 'forbidden', null, 0, 0, 0 ],[ 'immutable', null, 0, 0, 0 ],],
      variantSize32: 1,
      variantAlign32: 1,
      variantPayloadOffset32: 1,
      variantFlatCount: 1,
    } ), 2, 1, 1 ],
    ],
    variantSize32: 2,
    variantAlign32: 1,
    variantPayloadOffset32: 1,
    variantFlatCount: 2,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline42,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 42,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline42.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 8),_liftFlatStringAny,_liftFlatList({
    elemLiftFn: _liftFlatList({
      elemLiftFn: _liftFlatU8,
      elemAlign32: 1,
      elemSize32: 1,
      typedArray: Uint8Array,
    }),
    elemAlign32: 4,
    elemSize32: 8,
    typedArray: undefined,
  })],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', null, 2, 1, 1 ],
    [ 'err', _lowerFlatVariant({
      caseMetas: [[ 'invalid-syntax', null, 0, 0, 0 ],[ 'forbidden', null, 0, 0, 0 ],[ 'immutable', null, 0, 0, 0 ],],
      variantSize32: 1,
      variantAlign32: 1,
      variantPayloadOffset32: 1,
      variantFlatCount: 1,
    } ), 2, 1, 1 ],
    ],
    variantSize32: 2,
    variantAlign32: 1,
    variantPayloadOffset32: 1,
    variantFlatCount: 2,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline42,
},
);
let trampoline43 = _trampoline43.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 43,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline43.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 8),_liftFlatStringAny],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', null, 2, 1, 1 ],
    [ 'err', _lowerFlatVariant({
      caseMetas: [[ 'invalid-syntax', null, 0, 0, 0 ],[ 'forbidden', null, 0, 0, 0 ],[ 'immutable', null, 0, 0, 0 ],],
      variantSize32: 1,
      variantAlign32: 1,
      variantPayloadOffset32: 1,
      variantFlatCount: 1,
    } ), 2, 1, 1 ],
    ],
    variantSize32: 2,
    variantAlign32: 1,
    variantPayloadOffset32: 1,
    variantFlatCount: 2,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline43,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 43,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline43.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 8),_liftFlatStringAny],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', null, 2, 1, 1 ],
    [ 'err', _lowerFlatVariant({
      caseMetas: [[ 'invalid-syntax', null, 0, 0, 0 ],[ 'forbidden', null, 0, 0, 0 ],[ 'immutable', null, 0, 0, 0 ],],
      variantSize32: 1,
      variantAlign32: 1,
      variantPayloadOffset32: 1,
      variantFlatCount: 1,
    } ), 2, 1, 1 ],
    ],
    variantSize32: 2,
    variantAlign32: 1,
    variantPayloadOffset32: 1,
    variantFlatCount: 2,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline43,
},
);
let trampoline44 = _trampoline44.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 44,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline44.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 8),_liftFlatStringAny,_liftFlatList({
    elemLiftFn: _liftFlatU8,
    elemAlign32: 1,
    elemSize32: 1,
    typedArray: Uint8Array,
  })],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', null, 2, 1, 1 ],
    [ 'err', _lowerFlatVariant({
      caseMetas: [[ 'invalid-syntax', null, 0, 0, 0 ],[ 'forbidden', null, 0, 0, 0 ],[ 'immutable', null, 0, 0, 0 ],],
      variantSize32: 1,
      variantAlign32: 1,
      variantPayloadOffset32: 1,
      variantFlatCount: 1,
    } ), 2, 1, 1 ],
    ],
    variantSize32: 2,
    variantAlign32: 1,
    variantPayloadOffset32: 1,
    variantFlatCount: 2,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline44,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 44,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline44.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 8),_liftFlatStringAny,_liftFlatList({
    elemLiftFn: _liftFlatU8,
    elemAlign32: 1,
    elemSize32: 1,
    typedArray: Uint8Array,
  })],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', null, 2, 1, 1 ],
    [ 'err', _lowerFlatVariant({
      caseMetas: [[ 'invalid-syntax', null, 0, 0, 0 ],[ 'forbidden', null, 0, 0, 0 ],[ 'immutable', null, 0, 0, 0 ],],
      variantSize32: 1,
      variantAlign32: 1,
      variantPayloadOffset32: 1,
      variantFlatCount: 1,
    } ), 2, 1, 1 ],
    ],
    variantSize32: 2,
    variantAlign32: 1,
    variantPayloadOffset32: 1,
    variantFlatCount: 2,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline44,
},
);
let trampoline45 = _trampoline45.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 45,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline45.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 8)],
  resultLowerFns: [_lowerFlatList({
    elemLowerFn: _lowerFlatTuple({ elemLowerMetas: [[_lowerFlatStringAny, 8, 4],[_lowerFlatList({
      elemLowerFn: _lowerFlatU8,
      elemSize32: 1,
      elemAlign32: 1,
    }), 8, 4],], size32: 16, align32: 4 }),
    elemSize32: 16,
    elemAlign32: 4,
  })],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: () => realloc0,
  importFn: _trampoline45,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 45,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline45.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 8)],
  resultLowerFns: [_lowerFlatList({
    elemLowerFn: _lowerFlatTuple({ elemLowerMetas: [[_lowerFlatStringAny, 8, 4],[_lowerFlatList({
      elemLowerFn: _lowerFlatU8,
      elemSize32: 1,
      elemAlign32: 1,
    }), 8, 4],], size32: 16, align32: 4 }),
    elemSize32: 16,
    elemAlign32: 4,
  })],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: () => realloc0,
  importFn: _trampoline45,
},
);
let trampoline46 = _trampoline46.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 46,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline46.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 9)],
  resultLowerFns: [_lowerFlatVariant({
    caseMetas: [[ 'get', null, 0, 0, 0 ],[ 'head', null, 0, 0, 0 ],[ 'post', null, 0, 0, 0 ],[ 'put', null, 0, 0, 0 ],[ 'delete', null, 0, 0, 0 ],[ 'connect', null, 0, 0, 0 ],[ 'options', null, 0, 0, 0 ],[ 'trace', null, 0, 0, 0 ],[ 'patch', null, 0, 0, 0 ],[ 'other', _lowerFlatStringAny, 8, 4, 2 ],],
    variantSize32: 12,
    variantAlign32: 4,
    variantPayloadOffset32: 4,
    variantFlatCount: 3,
  } )],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: () => realloc0,
  importFn: _trampoline46,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 46,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline46.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 9)],
  resultLowerFns: [_lowerFlatVariant({
    caseMetas: [[ 'get', null, 0, 0, 0 ],[ 'head', null, 0, 0, 0 ],[ 'post', null, 0, 0, 0 ],[ 'put', null, 0, 0, 0 ],[ 'delete', null, 0, 0, 0 ],[ 'connect', null, 0, 0, 0 ],[ 'options', null, 0, 0, 0 ],[ 'trace', null, 0, 0, 0 ],[ 'patch', null, 0, 0, 0 ],[ 'other', _lowerFlatStringAny, 8, 4, 2 ],],
    variantSize32: 12,
    variantAlign32: 4,
    variantPayloadOffset32: 4,
    variantFlatCount: 3,
  } )],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: () => realloc0,
  importFn: _trampoline46,
},
);
let trampoline47 = _trampoline47.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 47,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline47.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 9)],
  resultLowerFns: [
  _lowerFlatOption({
    caseMetas: [
    [ 'none', null, 0, 0, 0 ],
    [ 'some', _lowerFlatStringAny, 8, 4, 2],
    ],
    variantSize32: 12,
    variantAlign32: 4,
    variantPayloadOffset32: 4,
    variantFlatCount: 3,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: () => realloc0,
  importFn: _trampoline47,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 47,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline47.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 9)],
  resultLowerFns: [
  _lowerFlatOption({
    caseMetas: [
    [ 'none', null, 0, 0, 0 ],
    [ 'some', _lowerFlatStringAny, 8, 4, 2],
    ],
    variantSize32: 12,
    variantAlign32: 4,
    variantPayloadOffset32: 4,
    variantFlatCount: 3,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: () => realloc0,
  importFn: _trampoline47,
},
);
let trampoline48 = _trampoline48.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 48,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline48.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 9)],
  resultLowerFns: [
  _lowerFlatOption({
    caseMetas: [
    [ 'none', null, 0, 0, 0 ],
    [ 'some', _lowerFlatVariant({
      caseMetas: [[ 'HTTP', null, 0, 0, 0 ],[ 'HTTPS', null, 0, 0, 0 ],[ 'other', _lowerFlatStringAny, 8, 4, 2 ],],
      variantSize32: 12,
      variantAlign32: 4,
      variantPayloadOffset32: 4,
      variantFlatCount: 3,
    } ), 12, 4, 3],
    ],
    variantSize32: 16,
    variantAlign32: 4,
    variantPayloadOffset32: 4,
    variantFlatCount: 4,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: () => realloc0,
  importFn: _trampoline48,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 48,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline48.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 9)],
  resultLowerFns: [
  _lowerFlatOption({
    caseMetas: [
    [ 'none', null, 0, 0, 0 ],
    [ 'some', _lowerFlatVariant({
      caseMetas: [[ 'HTTP', null, 0, 0, 0 ],[ 'HTTPS', null, 0, 0, 0 ],[ 'other', _lowerFlatStringAny, 8, 4, 2 ],],
      variantSize32: 12,
      variantAlign32: 4,
      variantPayloadOffset32: 4,
      variantFlatCount: 3,
    } ), 12, 4, 3],
    ],
    variantSize32: 16,
    variantAlign32: 4,
    variantPayloadOffset32: 4,
    variantFlatCount: 4,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: () => realloc0,
  importFn: _trampoline48,
},
);
let trampoline49 = _trampoline49.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 49,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline49.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 9)],
  resultLowerFns: [
  _lowerFlatOption({
    caseMetas: [
    [ 'none', null, 0, 0, 0 ],
    [ 'some', _lowerFlatStringAny, 8, 4, 2],
    ],
    variantSize32: 12,
    variantAlign32: 4,
    variantPayloadOffset32: 4,
    variantFlatCount: 3,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: () => realloc0,
  importFn: _trampoline49,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 49,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline49.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 9)],
  resultLowerFns: [
  _lowerFlatOption({
    caseMetas: [
    [ 'none', null, 0, 0, 0 ],
    [ 'some', _lowerFlatStringAny, 8, 4, 2],
    ],
    variantSize32: 12,
    variantAlign32: 4,
    variantPayloadOffset32: 4,
    variantFlatCount: 3,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: () => realloc0,
  importFn: _trampoline49,
},
);
let trampoline50 = _trampoline50.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 50,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline50.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 9)],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', _lowerFlatOwn({
      componentIdx: 0,
      lowerFn: 
      function lowerImportedOwnedHost_IncomingBody(obj) {
        if (!(obj instanceof IncomingBody)) {
          throw new TypeError('Resource error: Not a valid \"IncomingBody\" resource.');
        }
        let handle = obj[symbolRscHandle];
        if (!handle) {
          const rep = obj[symbolRscRep] || ++captureCnt10;
          captureTable10.set(rep, obj);
          handle = rscTableCreateOwn(handleTable10, rep);
        }
        return handle;
      }
      ,
    }), 8, 4, 4 ],
    [ 'err', null, 8, 4, 4 ],
    ],
    variantSize32: 8,
    variantAlign32: 4,
    variantPayloadOffset32: 4,
    variantFlatCount: 2,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline50,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 50,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline50.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 9)],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', _lowerFlatOwn({
      componentIdx: 0,
      lowerFn: 
      function lowerImportedOwnedHost_IncomingBody(obj) {
        if (!(obj instanceof IncomingBody)) {
          throw new TypeError('Resource error: Not a valid \"IncomingBody\" resource.');
        }
        let handle = obj[symbolRscHandle];
        if (!handle) {
          const rep = obj[symbolRscRep] || ++captureCnt10;
          captureTable10.set(rep, obj);
          handle = rscTableCreateOwn(handleTable10, rep);
        }
        return handle;
      }
      ,
    }), 8, 4, 4 ],
    [ 'err', null, 8, 4, 4 ],
    ],
    variantSize32: 8,
    variantAlign32: 4,
    variantPayloadOffset32: 4,
    variantFlatCount: 2,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline50,
},
);
let trampoline51 = _trampoline51.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 51,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline51.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 11)],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', _lowerFlatOwn({
      componentIdx: 0,
      lowerFn: 
      function lowerImportedOwnedHost_OutgoingBody(obj) {
        if (!(obj instanceof OutgoingBody)) {
          throw new TypeError('Resource error: Not a valid \"OutgoingBody\" resource.');
        }
        let handle = obj[symbolRscHandle];
        if (!handle) {
          const rep = obj[symbolRscRep] || ++captureCnt12;
          captureTable12.set(rep, obj);
          handle = rscTableCreateOwn(handleTable12, rep);
        }
        return handle;
      }
      ,
    }), 8, 4, 4 ],
    [ 'err', null, 8, 4, 4 ],
    ],
    variantSize32: 8,
    variantAlign32: 4,
    variantPayloadOffset32: 4,
    variantFlatCount: 2,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline51,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 51,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline51.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 11)],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', _lowerFlatOwn({
      componentIdx: 0,
      lowerFn: 
      function lowerImportedOwnedHost_OutgoingBody(obj) {
        if (!(obj instanceof OutgoingBody)) {
          throw new TypeError('Resource error: Not a valid \"OutgoingBody\" resource.');
        }
        let handle = obj[symbolRscHandle];
        if (!handle) {
          const rep = obj[symbolRscRep] || ++captureCnt12;
          captureTable12.set(rep, obj);
          handle = rscTableCreateOwn(handleTable12, rep);
        }
        return handle;
      }
      ,
    }), 8, 4, 4 ],
    [ 'err', null, 8, 4, 4 ],
    ],
    variantSize32: 8,
    variantAlign32: 4,
    variantPayloadOffset32: 4,
    variantFlatCount: 2,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline51,
},
);
let trampoline52 = _trampoline52.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 52,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline52.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 11),_liftFlatVariant({
    caseMetas: [['get', null, 0, 0, 0],['head', null, 0, 0, 0],['post', null, 0, 0, 0],['put', null, 0, 0, 0],['delete', null, 0, 0, 0],['connect', null, 0, 0, 0],['options', null, 0, 0, 0],['trace', null, 0, 0, 0],['patch', null, 0, 0, 0],['other', _liftFlatStringAny, 8, 4, 2],],
    variantSize32: 12,
    variantAlign32: 4,
    variantPayloadOffset32: 4,
    variantFlatCount: 3,
  } )],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', null, 1, 1, 1 ],
    [ 'err', null, 1, 1, 1 ],
    ],
    variantSize32: 1,
    variantAlign32: 1,
    variantPayloadOffset32: 1,
    variantFlatCount: 1,
  })
  ],
  hasResultPointer: false,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline52,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 52,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline52.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 11),_liftFlatVariant({
    caseMetas: [['get', null, 0, 0, 0],['head', null, 0, 0, 0],['post', null, 0, 0, 0],['put', null, 0, 0, 0],['delete', null, 0, 0, 0],['connect', null, 0, 0, 0],['options', null, 0, 0, 0],['trace', null, 0, 0, 0],['patch', null, 0, 0, 0],['other', _liftFlatStringAny, 8, 4, 2],],
    variantSize32: 12,
    variantAlign32: 4,
    variantPayloadOffset32: 4,
    variantFlatCount: 3,
  } )],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', null, 1, 1, 1 ],
    [ 'err', null, 1, 1, 1 ],
    ],
    variantSize32: 1,
    variantAlign32: 1,
    variantPayloadOffset32: 1,
    variantFlatCount: 1,
  })
  ],
  hasResultPointer: false,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline52,
},
);
let trampoline53 = _trampoline53.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 53,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline53.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 11),
  _liftFlatOption({
    caseMetas: [
    ['none', null, 0, 0, 0 ],
    ['some', _liftFlatStringAny, 8, 4, 2 ],
    ],
    variantSize32: 12,
    variantAlign32: 4,
    variantPayloadOffset32: 4,
    variantFlatCount: 3,
  })
  ],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', null, 1, 1, 1 ],
    [ 'err', null, 1, 1, 1 ],
    ],
    variantSize32: 1,
    variantAlign32: 1,
    variantPayloadOffset32: 1,
    variantFlatCount: 1,
  })
  ],
  hasResultPointer: false,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline53,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 53,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline53.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 11),
  _liftFlatOption({
    caseMetas: [
    ['none', null, 0, 0, 0 ],
    ['some', _liftFlatStringAny, 8, 4, 2 ],
    ],
    variantSize32: 12,
    variantAlign32: 4,
    variantPayloadOffset32: 4,
    variantFlatCount: 3,
  })
  ],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', null, 1, 1, 1 ],
    [ 'err', null, 1, 1, 1 ],
    ],
    variantSize32: 1,
    variantAlign32: 1,
    variantPayloadOffset32: 1,
    variantFlatCount: 1,
  })
  ],
  hasResultPointer: false,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline53,
},
);
let trampoline54 = _trampoline54.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 54,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline54.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 11),
  _liftFlatOption({
    caseMetas: [
    ['none', null, 0, 0, 0 ],
    ['some', _liftFlatVariant({
      caseMetas: [['HTTP', null, 0, 0, 0],['HTTPS', null, 0, 0, 0],['other', _liftFlatStringAny, 8, 4, 2],],
      variantSize32: 12,
      variantAlign32: 4,
      variantPayloadOffset32: 4,
      variantFlatCount: 3,
    } ), 12, 4, 3 ],
    ],
    variantSize32: 16,
    variantAlign32: 4,
    variantPayloadOffset32: 4,
    variantFlatCount: 4,
  })
  ],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', null, 1, 1, 1 ],
    [ 'err', null, 1, 1, 1 ],
    ],
    variantSize32: 1,
    variantAlign32: 1,
    variantPayloadOffset32: 1,
    variantFlatCount: 1,
  })
  ],
  hasResultPointer: false,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline54,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 54,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline54.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 11),
  _liftFlatOption({
    caseMetas: [
    ['none', null, 0, 0, 0 ],
    ['some', _liftFlatVariant({
      caseMetas: [['HTTP', null, 0, 0, 0],['HTTPS', null, 0, 0, 0],['other', _liftFlatStringAny, 8, 4, 2],],
      variantSize32: 12,
      variantAlign32: 4,
      variantPayloadOffset32: 4,
      variantFlatCount: 3,
    } ), 12, 4, 3 ],
    ],
    variantSize32: 16,
    variantAlign32: 4,
    variantPayloadOffset32: 4,
    variantFlatCount: 4,
  })
  ],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', null, 1, 1, 1 ],
    [ 'err', null, 1, 1, 1 ],
    ],
    variantSize32: 1,
    variantAlign32: 1,
    variantPayloadOffset32: 1,
    variantFlatCount: 1,
  })
  ],
  hasResultPointer: false,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline54,
},
);
let trampoline55 = _trampoline55.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 55,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline55.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 11),
  _liftFlatOption({
    caseMetas: [
    ['none', null, 0, 0, 0 ],
    ['some', _liftFlatStringAny, 8, 4, 2 ],
    ],
    variantSize32: 12,
    variantAlign32: 4,
    variantPayloadOffset32: 4,
    variantFlatCount: 3,
  })
  ],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', null, 1, 1, 1 ],
    [ 'err', null, 1, 1, 1 ],
    ],
    variantSize32: 1,
    variantAlign32: 1,
    variantPayloadOffset32: 1,
    variantFlatCount: 1,
  })
  ],
  hasResultPointer: false,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline55,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 55,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline55.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 11),
  _liftFlatOption({
    caseMetas: [
    ['none', null, 0, 0, 0 ],
    ['some', _liftFlatStringAny, 8, 4, 2 ],
    ],
    variantSize32: 12,
    variantAlign32: 4,
    variantPayloadOffset32: 4,
    variantFlatCount: 3,
  })
  ],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', null, 1, 1, 1 ],
    [ 'err', null, 1, 1, 1 ],
    ],
    variantSize32: 1,
    variantAlign32: 1,
    variantPayloadOffset32: 1,
    variantFlatCount: 1,
  })
  ],
  hasResultPointer: false,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline55,
},
);
let trampoline56 = _trampoline56.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 56,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline56.manuallyAsync,
  paramLiftFns: [_liftFlatOwn({
    componentIdx: 0,
    className: ResponseOutparam,
    createResourceFn: 
    (handle) => {
      const rep = handleTable13[(handle << 1) + 1] & ~T_FLAG;
      let resourceObj = captureTable13.get(rep);
      if (!resourceObj) {
        resourceObj = Object.create(ResponseOutparam.prototype);
        Object.defineProperty(resourceObj, symbolRscHandle, { writable: true, value: handle });
        Object.defineProperty(resourceObj, symbolRscRep, { writable: true, value: rep });
      } else {
        captureTable13.delete(rep);
      }
      rscTableRemove(handleTable13, handle);
      return resourceObj;
    }
    ,
  })
  ,
  _liftFlatResult({
    caseMetas: [['ok', _liftFlatOwn({
      componentIdx: 0,
      className: OutgoingResponse,
      createResourceFn: 
      (handle) => {
        const rep = handleTable14[(handle << 1) + 1] & ~T_FLAG;
        let resourceObj = captureTable14.get(rep);
        if (!resourceObj) {
          resourceObj = Object.create(OutgoingResponse.prototype);
          Object.defineProperty(resourceObj, symbolRscHandle, { writable: true, value: handle });
          Object.defineProperty(resourceObj, symbolRscRep, { writable: true, value: rep });
        } else {
          captureTable14.delete(rep);
        }
        rscTableRemove(handleTable14, handle);
        return resourceObj;
      }
      ,
    })
    , 4, 4, 1],['err', _liftFlatVariant({
      caseMetas: [['DNS-timeout', null, 0, 0, 0],['DNS-error', _liftFlatRecord({ fieldMetas: [['rcode', 
      _liftFlatOption({
        caseMetas: [
        ['none', null, 0, 0, 0 ],
        ['some', _liftFlatStringAny, 8, 4, 2 ],
        ],
        variantSize32: 12,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 3,
      })
      , 12, 4],['infoCode', 
      _liftFlatOption({
        caseMetas: [
        ['none', null, 0, 0, 0 ],
        ['some', _liftFlatU16, 2, 2, 1 ],
        ],
        variantSize32: 4,
        variantAlign32: 2,
        variantPayloadOffset32: 2,
        variantFlatCount: 2,
      })
      , 4, 2],], size32: 16, align32: 4 }), 16, 4, 5],['destination-not-found', null, 0, 0, 0],['destination-unavailable', null, 0, 0, 0],['destination-IP-prohibited', null, 0, 0, 0],['destination-IP-unroutable', null, 0, 0, 0],['connection-refused', null, 0, 0, 0],['connection-terminated', null, 0, 0, 0],['connection-timeout', null, 0, 0, 0],['connection-read-timeout', null, 0, 0, 0],['connection-write-timeout', null, 0, 0, 0],['connection-limit-reached', null, 0, 0, 0],['TLS-protocol-error', null, 0, 0, 0],['TLS-certificate-error', null, 0, 0, 0],['TLS-alert-received', _liftFlatRecord({ fieldMetas: [['alertId', 
      _liftFlatOption({
        caseMetas: [
        ['none', null, 0, 0, 0 ],
        ['some', _liftFlatU8, 1, 1, 1 ],
        ],
        variantSize32: 2,
        variantAlign32: 1,
        variantPayloadOffset32: 1,
        variantFlatCount: 2,
      })
      , 2, 1],['alertMessage', 
      _liftFlatOption({
        caseMetas: [
        ['none', null, 0, 0, 0 ],
        ['some', _liftFlatStringAny, 8, 4, 2 ],
        ],
        variantSize32: 12,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 3,
      })
      , 12, 4],], size32: 16, align32: 4 }), 16, 4, 5],['HTTP-request-denied', null, 0, 0, 0],['HTTP-request-length-required', null, 0, 0, 0],['HTTP-request-body-size', 
      _liftFlatOption({
        caseMetas: [
        ['none', null, 0, 0, 0 ],
        ['some', _liftFlatU64, 8, 8, 1 ],
        ],
        variantSize32: 16,
        variantAlign32: 8,
        variantPayloadOffset32: 8,
        variantFlatCount: 2,
      })
      , 16, 8, 2],['HTTP-request-method-invalid', null, 0, 0, 0],['HTTP-request-URI-invalid', null, 0, 0, 0],['HTTP-request-URI-too-long', null, 0, 0, 0],['HTTP-request-header-section-size', 
      _liftFlatOption({
        caseMetas: [
        ['none', null, 0, 0, 0 ],
        ['some', _liftFlatU32, 4, 4, 1 ],
        ],
        variantSize32: 8,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 2,
      })
      , 8, 4, 2],['HTTP-request-header-size', 
      _liftFlatOption({
        caseMetas: [
        ['none', null, 0, 0, 0 ],
        ['some', _liftFlatRecord({ fieldMetas: [['fieldName', 
        _liftFlatOption({
          caseMetas: [
          ['none', null, 0, 0, 0 ],
          ['some', _liftFlatStringAny, 8, 4, 2 ],
          ],
          variantSize32: 12,
          variantAlign32: 4,
          variantPayloadOffset32: 4,
          variantFlatCount: 3,
        })
        , 12, 4],['fieldSize', 
        _liftFlatOption({
          caseMetas: [
          ['none', null, 0, 0, 0 ],
          ['some', _liftFlatU32, 4, 4, 1 ],
          ],
          variantSize32: 8,
          variantAlign32: 4,
          variantPayloadOffset32: 4,
          variantFlatCount: 2,
        })
        , 8, 4],], size32: 20, align32: 4 }), 20, 4, 5 ],
        ],
        variantSize32: 24,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 6,
      })
      , 24, 4, 6],['HTTP-request-trailer-section-size', 
      _liftFlatOption({
        caseMetas: [
        ['none', null, 0, 0, 0 ],
        ['some', _liftFlatU32, 4, 4, 1 ],
        ],
        variantSize32: 8,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 2,
      })
      , 8, 4, 2],['HTTP-request-trailer-size', _liftFlatRecord({ fieldMetas: [['fieldName', 
      _liftFlatOption({
        caseMetas: [
        ['none', null, 0, 0, 0 ],
        ['some', _liftFlatStringAny, 8, 4, 2 ],
        ],
        variantSize32: 12,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 3,
      })
      , 12, 4],['fieldSize', 
      _liftFlatOption({
        caseMetas: [
        ['none', null, 0, 0, 0 ],
        ['some', _liftFlatU32, 4, 4, 1 ],
        ],
        variantSize32: 8,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 2,
      })
      , 8, 4],], size32: 20, align32: 4 }), 20, 4, 5],['HTTP-response-incomplete', null, 0, 0, 0],['HTTP-response-header-section-size', 
      _liftFlatOption({
        caseMetas: [
        ['none', null, 0, 0, 0 ],
        ['some', _liftFlatU32, 4, 4, 1 ],
        ],
        variantSize32: 8,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 2,
      })
      , 8, 4, 2],['HTTP-response-header-size', _liftFlatRecord({ fieldMetas: [['fieldName', 
      _liftFlatOption({
        caseMetas: [
        ['none', null, 0, 0, 0 ],
        ['some', _liftFlatStringAny, 8, 4, 2 ],
        ],
        variantSize32: 12,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 3,
      })
      , 12, 4],['fieldSize', 
      _liftFlatOption({
        caseMetas: [
        ['none', null, 0, 0, 0 ],
        ['some', _liftFlatU32, 4, 4, 1 ],
        ],
        variantSize32: 8,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 2,
      })
      , 8, 4],], size32: 20, align32: 4 }), 20, 4, 5],['HTTP-response-body-size', 
      _liftFlatOption({
        caseMetas: [
        ['none', null, 0, 0, 0 ],
        ['some', _liftFlatU64, 8, 8, 1 ],
        ],
        variantSize32: 16,
        variantAlign32: 8,
        variantPayloadOffset32: 8,
        variantFlatCount: 2,
      })
      , 16, 8, 2],['HTTP-response-trailer-section-size', 
      _liftFlatOption({
        caseMetas: [
        ['none', null, 0, 0, 0 ],
        ['some', _liftFlatU32, 4, 4, 1 ],
        ],
        variantSize32: 8,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 2,
      })
      , 8, 4, 2],['HTTP-response-trailer-size', _liftFlatRecord({ fieldMetas: [['fieldName', 
      _liftFlatOption({
        caseMetas: [
        ['none', null, 0, 0, 0 ],
        ['some', _liftFlatStringAny, 8, 4, 2 ],
        ],
        variantSize32: 12,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 3,
      })
      , 12, 4],['fieldSize', 
      _liftFlatOption({
        caseMetas: [
        ['none', null, 0, 0, 0 ],
        ['some', _liftFlatU32, 4, 4, 1 ],
        ],
        variantSize32: 8,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 2,
      })
      , 8, 4],], size32: 20, align32: 4 }), 20, 4, 5],['HTTP-response-transfer-coding', 
      _liftFlatOption({
        caseMetas: [
        ['none', null, 0, 0, 0 ],
        ['some', _liftFlatStringAny, 8, 4, 2 ],
        ],
        variantSize32: 12,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 3,
      })
      , 12, 4, 3],['HTTP-response-content-coding', 
      _liftFlatOption({
        caseMetas: [
        ['none', null, 0, 0, 0 ],
        ['some', _liftFlatStringAny, 8, 4, 2 ],
        ],
        variantSize32: 12,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 3,
      })
      , 12, 4, 3],['HTTP-response-timeout', null, 0, 0, 0],['HTTP-upgrade-failed', null, 0, 0, 0],['HTTP-protocol-error', null, 0, 0, 0],['loop-detected', null, 0, 0, 0],['configuration-error', null, 0, 0, 0],['internal-error', 
      _liftFlatOption({
        caseMetas: [
        ['none', null, 0, 0, 0 ],
        ['some', _liftFlatStringAny, 8, 4, 2 ],
        ],
        variantSize32: 12,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 3,
      })
      , 12, 4, 3],],
      variantSize32: 32,
      variantAlign32: 8,
      variantPayloadOffset32: 8,
      variantFlatCount: 7,
    } ), 32, 8, 7],],
    variantSize32: 40,
    variantAlign32: 8,
    variantPayloadOffset32: 8,
    variantFlatCount: 8,
  })
  ],
  resultLowerFns: [],
  hasResultPointer: false,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline56,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 56,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline56.manuallyAsync,
  paramLiftFns: [_liftFlatOwn({
    componentIdx: 0,
    className: ResponseOutparam,
    createResourceFn: 
    (handle) => {
      const rep = handleTable13[(handle << 1) + 1] & ~T_FLAG;
      let resourceObj = captureTable13.get(rep);
      if (!resourceObj) {
        resourceObj = Object.create(ResponseOutparam.prototype);
        Object.defineProperty(resourceObj, symbolRscHandle, { writable: true, value: handle });
        Object.defineProperty(resourceObj, symbolRscRep, { writable: true, value: rep });
      } else {
        captureTable13.delete(rep);
      }
      rscTableRemove(handleTable13, handle);
      return resourceObj;
    }
    ,
  })
  ,
  _liftFlatResult({
    caseMetas: [['ok', _liftFlatOwn({
      componentIdx: 0,
      className: OutgoingResponse,
      createResourceFn: 
      (handle) => {
        const rep = handleTable14[(handle << 1) + 1] & ~T_FLAG;
        let resourceObj = captureTable14.get(rep);
        if (!resourceObj) {
          resourceObj = Object.create(OutgoingResponse.prototype);
          Object.defineProperty(resourceObj, symbolRscHandle, { writable: true, value: handle });
          Object.defineProperty(resourceObj, symbolRscRep, { writable: true, value: rep });
        } else {
          captureTable14.delete(rep);
        }
        rscTableRemove(handleTable14, handle);
        return resourceObj;
      }
      ,
    })
    , 4, 4, 1],['err', _liftFlatVariant({
      caseMetas: [['DNS-timeout', null, 0, 0, 0],['DNS-error', _liftFlatRecord({ fieldMetas: [['rcode', 
      _liftFlatOption({
        caseMetas: [
        ['none', null, 0, 0, 0 ],
        ['some', _liftFlatStringAny, 8, 4, 2 ],
        ],
        variantSize32: 12,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 3,
      })
      , 12, 4],['infoCode', 
      _liftFlatOption({
        caseMetas: [
        ['none', null, 0, 0, 0 ],
        ['some', _liftFlatU16, 2, 2, 1 ],
        ],
        variantSize32: 4,
        variantAlign32: 2,
        variantPayloadOffset32: 2,
        variantFlatCount: 2,
      })
      , 4, 2],], size32: 16, align32: 4 }), 16, 4, 5],['destination-not-found', null, 0, 0, 0],['destination-unavailable', null, 0, 0, 0],['destination-IP-prohibited', null, 0, 0, 0],['destination-IP-unroutable', null, 0, 0, 0],['connection-refused', null, 0, 0, 0],['connection-terminated', null, 0, 0, 0],['connection-timeout', null, 0, 0, 0],['connection-read-timeout', null, 0, 0, 0],['connection-write-timeout', null, 0, 0, 0],['connection-limit-reached', null, 0, 0, 0],['TLS-protocol-error', null, 0, 0, 0],['TLS-certificate-error', null, 0, 0, 0],['TLS-alert-received', _liftFlatRecord({ fieldMetas: [['alertId', 
      _liftFlatOption({
        caseMetas: [
        ['none', null, 0, 0, 0 ],
        ['some', _liftFlatU8, 1, 1, 1 ],
        ],
        variantSize32: 2,
        variantAlign32: 1,
        variantPayloadOffset32: 1,
        variantFlatCount: 2,
      })
      , 2, 1],['alertMessage', 
      _liftFlatOption({
        caseMetas: [
        ['none', null, 0, 0, 0 ],
        ['some', _liftFlatStringAny, 8, 4, 2 ],
        ],
        variantSize32: 12,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 3,
      })
      , 12, 4],], size32: 16, align32: 4 }), 16, 4, 5],['HTTP-request-denied', null, 0, 0, 0],['HTTP-request-length-required', null, 0, 0, 0],['HTTP-request-body-size', 
      _liftFlatOption({
        caseMetas: [
        ['none', null, 0, 0, 0 ],
        ['some', _liftFlatU64, 8, 8, 1 ],
        ],
        variantSize32: 16,
        variantAlign32: 8,
        variantPayloadOffset32: 8,
        variantFlatCount: 2,
      })
      , 16, 8, 2],['HTTP-request-method-invalid', null, 0, 0, 0],['HTTP-request-URI-invalid', null, 0, 0, 0],['HTTP-request-URI-too-long', null, 0, 0, 0],['HTTP-request-header-section-size', 
      _liftFlatOption({
        caseMetas: [
        ['none', null, 0, 0, 0 ],
        ['some', _liftFlatU32, 4, 4, 1 ],
        ],
        variantSize32: 8,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 2,
      })
      , 8, 4, 2],['HTTP-request-header-size', 
      _liftFlatOption({
        caseMetas: [
        ['none', null, 0, 0, 0 ],
        ['some', _liftFlatRecord({ fieldMetas: [['fieldName', 
        _liftFlatOption({
          caseMetas: [
          ['none', null, 0, 0, 0 ],
          ['some', _liftFlatStringAny, 8, 4, 2 ],
          ],
          variantSize32: 12,
          variantAlign32: 4,
          variantPayloadOffset32: 4,
          variantFlatCount: 3,
        })
        , 12, 4],['fieldSize', 
        _liftFlatOption({
          caseMetas: [
          ['none', null, 0, 0, 0 ],
          ['some', _liftFlatU32, 4, 4, 1 ],
          ],
          variantSize32: 8,
          variantAlign32: 4,
          variantPayloadOffset32: 4,
          variantFlatCount: 2,
        })
        , 8, 4],], size32: 20, align32: 4 }), 20, 4, 5 ],
        ],
        variantSize32: 24,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 6,
      })
      , 24, 4, 6],['HTTP-request-trailer-section-size', 
      _liftFlatOption({
        caseMetas: [
        ['none', null, 0, 0, 0 ],
        ['some', _liftFlatU32, 4, 4, 1 ],
        ],
        variantSize32: 8,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 2,
      })
      , 8, 4, 2],['HTTP-request-trailer-size', _liftFlatRecord({ fieldMetas: [['fieldName', 
      _liftFlatOption({
        caseMetas: [
        ['none', null, 0, 0, 0 ],
        ['some', _liftFlatStringAny, 8, 4, 2 ],
        ],
        variantSize32: 12,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 3,
      })
      , 12, 4],['fieldSize', 
      _liftFlatOption({
        caseMetas: [
        ['none', null, 0, 0, 0 ],
        ['some', _liftFlatU32, 4, 4, 1 ],
        ],
        variantSize32: 8,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 2,
      })
      , 8, 4],], size32: 20, align32: 4 }), 20, 4, 5],['HTTP-response-incomplete', null, 0, 0, 0],['HTTP-response-header-section-size', 
      _liftFlatOption({
        caseMetas: [
        ['none', null, 0, 0, 0 ],
        ['some', _liftFlatU32, 4, 4, 1 ],
        ],
        variantSize32: 8,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 2,
      })
      , 8, 4, 2],['HTTP-response-header-size', _liftFlatRecord({ fieldMetas: [['fieldName', 
      _liftFlatOption({
        caseMetas: [
        ['none', null, 0, 0, 0 ],
        ['some', _liftFlatStringAny, 8, 4, 2 ],
        ],
        variantSize32: 12,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 3,
      })
      , 12, 4],['fieldSize', 
      _liftFlatOption({
        caseMetas: [
        ['none', null, 0, 0, 0 ],
        ['some', _liftFlatU32, 4, 4, 1 ],
        ],
        variantSize32: 8,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 2,
      })
      , 8, 4],], size32: 20, align32: 4 }), 20, 4, 5],['HTTP-response-body-size', 
      _liftFlatOption({
        caseMetas: [
        ['none', null, 0, 0, 0 ],
        ['some', _liftFlatU64, 8, 8, 1 ],
        ],
        variantSize32: 16,
        variantAlign32: 8,
        variantPayloadOffset32: 8,
        variantFlatCount: 2,
      })
      , 16, 8, 2],['HTTP-response-trailer-section-size', 
      _liftFlatOption({
        caseMetas: [
        ['none', null, 0, 0, 0 ],
        ['some', _liftFlatU32, 4, 4, 1 ],
        ],
        variantSize32: 8,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 2,
      })
      , 8, 4, 2],['HTTP-response-trailer-size', _liftFlatRecord({ fieldMetas: [['fieldName', 
      _liftFlatOption({
        caseMetas: [
        ['none', null, 0, 0, 0 ],
        ['some', _liftFlatStringAny, 8, 4, 2 ],
        ],
        variantSize32: 12,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 3,
      })
      , 12, 4],['fieldSize', 
      _liftFlatOption({
        caseMetas: [
        ['none', null, 0, 0, 0 ],
        ['some', _liftFlatU32, 4, 4, 1 ],
        ],
        variantSize32: 8,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 2,
      })
      , 8, 4],], size32: 20, align32: 4 }), 20, 4, 5],['HTTP-response-transfer-coding', 
      _liftFlatOption({
        caseMetas: [
        ['none', null, 0, 0, 0 ],
        ['some', _liftFlatStringAny, 8, 4, 2 ],
        ],
        variantSize32: 12,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 3,
      })
      , 12, 4, 3],['HTTP-response-content-coding', 
      _liftFlatOption({
        caseMetas: [
        ['none', null, 0, 0, 0 ],
        ['some', _liftFlatStringAny, 8, 4, 2 ],
        ],
        variantSize32: 12,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 3,
      })
      , 12, 4, 3],['HTTP-response-timeout', null, 0, 0, 0],['HTTP-upgrade-failed', null, 0, 0, 0],['HTTP-protocol-error', null, 0, 0, 0],['loop-detected', null, 0, 0, 0],['configuration-error', null, 0, 0, 0],['internal-error', 
      _liftFlatOption({
        caseMetas: [
        ['none', null, 0, 0, 0 ],
        ['some', _liftFlatStringAny, 8, 4, 2 ],
        ],
        variantSize32: 12,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 3,
      })
      , 12, 4, 3],],
      variantSize32: 32,
      variantAlign32: 8,
      variantPayloadOffset32: 8,
      variantFlatCount: 7,
    } ), 32, 8, 7],],
    variantSize32: 40,
    variantAlign32: 8,
    variantPayloadOffset32: 8,
    variantFlatCount: 8,
  })
  ],
  resultLowerFns: [],
  hasResultPointer: false,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline56,
},
);
let trampoline57 = _trampoline57.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 57,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline57.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 15)],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', _lowerFlatOwn({
      componentIdx: 0,
      lowerFn: 
      function lowerImportedOwnedHost_IncomingBody(obj) {
        if (!(obj instanceof IncomingBody)) {
          throw new TypeError('Resource error: Not a valid \"IncomingBody\" resource.');
        }
        let handle = obj[symbolRscHandle];
        if (!handle) {
          const rep = obj[symbolRscRep] || ++captureCnt10;
          captureTable10.set(rep, obj);
          handle = rscTableCreateOwn(handleTable10, rep);
        }
        return handle;
      }
      ,
    }), 8, 4, 4 ],
    [ 'err', null, 8, 4, 4 ],
    ],
    variantSize32: 8,
    variantAlign32: 4,
    variantPayloadOffset32: 4,
    variantFlatCount: 2,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline57,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 57,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline57.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 15)],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', _lowerFlatOwn({
      componentIdx: 0,
      lowerFn: 
      function lowerImportedOwnedHost_IncomingBody(obj) {
        if (!(obj instanceof IncomingBody)) {
          throw new TypeError('Resource error: Not a valid \"IncomingBody\" resource.');
        }
        let handle = obj[symbolRscHandle];
        if (!handle) {
          const rep = obj[symbolRscRep] || ++captureCnt10;
          captureTable10.set(rep, obj);
          handle = rscTableCreateOwn(handleTable10, rep);
        }
        return handle;
      }
      ,
    }), 8, 4, 4 ],
    [ 'err', null, 8, 4, 4 ],
    ],
    variantSize32: 8,
    variantAlign32: 4,
    variantPayloadOffset32: 4,
    variantFlatCount: 2,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline57,
},
);
let trampoline58 = _trampoline58.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 58,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline58.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 10)],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', _lowerFlatOwn({
      componentIdx: 0,
      lowerFn: 
      function lowerImportedOwnedHost_InputStream(obj) {
        if (!(obj instanceof InputStream)) {
          throw new TypeError('Resource error: Not a valid \"InputStream\" resource.');
        }
        let handle = obj[symbolRscHandle];
        if (!handle) {
          const rep = obj[symbolRscRep] || ++captureCnt3;
          captureTable3.set(rep, obj);
          handle = rscTableCreateOwn(handleTable3, rep);
        }
        return handle;
      }
      ,
    }), 8, 4, 4 ],
    [ 'err', null, 8, 4, 4 ],
    ],
    variantSize32: 8,
    variantAlign32: 4,
    variantPayloadOffset32: 4,
    variantFlatCount: 2,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline58,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 58,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline58.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 10)],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', _lowerFlatOwn({
      componentIdx: 0,
      lowerFn: 
      function lowerImportedOwnedHost_InputStream(obj) {
        if (!(obj instanceof InputStream)) {
          throw new TypeError('Resource error: Not a valid \"InputStream\" resource.');
        }
        let handle = obj[symbolRscHandle];
        if (!handle) {
          const rep = obj[symbolRscRep] || ++captureCnt3;
          captureTable3.set(rep, obj);
          handle = rscTableCreateOwn(handleTable3, rep);
        }
        return handle;
      }
      ,
    }), 8, 4, 4 ],
    [ 'err', null, 8, 4, 4 ],
    ],
    variantSize32: 8,
    variantAlign32: 4,
    variantPayloadOffset32: 4,
    variantFlatCount: 2,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline58,
},
);
let trampoline59 = _trampoline59.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 59,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline59.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 14)],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', _lowerFlatOwn({
      componentIdx: 0,
      lowerFn: 
      function lowerImportedOwnedHost_OutgoingBody(obj) {
        if (!(obj instanceof OutgoingBody)) {
          throw new TypeError('Resource error: Not a valid \"OutgoingBody\" resource.');
        }
        let handle = obj[symbolRscHandle];
        if (!handle) {
          const rep = obj[symbolRscRep] || ++captureCnt12;
          captureTable12.set(rep, obj);
          handle = rscTableCreateOwn(handleTable12, rep);
        }
        return handle;
      }
      ,
    }), 8, 4, 4 ],
    [ 'err', null, 8, 4, 4 ],
    ],
    variantSize32: 8,
    variantAlign32: 4,
    variantPayloadOffset32: 4,
    variantFlatCount: 2,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline59,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 59,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline59.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 14)],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', _lowerFlatOwn({
      componentIdx: 0,
      lowerFn: 
      function lowerImportedOwnedHost_OutgoingBody(obj) {
        if (!(obj instanceof OutgoingBody)) {
          throw new TypeError('Resource error: Not a valid \"OutgoingBody\" resource.');
        }
        let handle = obj[symbolRscHandle];
        if (!handle) {
          const rep = obj[symbolRscRep] || ++captureCnt12;
          captureTable12.set(rep, obj);
          handle = rscTableCreateOwn(handleTable12, rep);
        }
        return handle;
      }
      ,
    }), 8, 4, 4 ],
    [ 'err', null, 8, 4, 4 ],
    ],
    variantSize32: 8,
    variantAlign32: 4,
    variantPayloadOffset32: 4,
    variantFlatCount: 2,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline59,
},
);
let trampoline60 = _trampoline60.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 60,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline60.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 12)],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', _lowerFlatOwn({
      componentIdx: 0,
      lowerFn: 
      function lowerImportedOwnedHost_OutputStream(obj) {
        if (!(obj instanceof OutputStream)) {
          throw new TypeError('Resource error: Not a valid \"OutputStream\" resource.');
        }
        let handle = obj[symbolRscHandle];
        if (!handle) {
          const rep = obj[symbolRscRep] || ++captureCnt4;
          captureTable4.set(rep, obj);
          handle = rscTableCreateOwn(handleTable4, rep);
        }
        return handle;
      }
      ,
    }), 8, 4, 4 ],
    [ 'err', null, 8, 4, 4 ],
    ],
    variantSize32: 8,
    variantAlign32: 4,
    variantPayloadOffset32: 4,
    variantFlatCount: 2,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline60,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 60,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline60.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 12)],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', _lowerFlatOwn({
      componentIdx: 0,
      lowerFn: 
      function lowerImportedOwnedHost_OutputStream(obj) {
        if (!(obj instanceof OutputStream)) {
          throw new TypeError('Resource error: Not a valid \"OutputStream\" resource.');
        }
        let handle = obj[symbolRscHandle];
        if (!handle) {
          const rep = obj[symbolRscRep] || ++captureCnt4;
          captureTable4.set(rep, obj);
          handle = rscTableCreateOwn(handleTable4, rep);
        }
        return handle;
      }
      ,
    }), 8, 4, 4 ],
    [ 'err', null, 8, 4, 4 ],
    ],
    variantSize32: 8,
    variantAlign32: 4,
    variantPayloadOffset32: 4,
    variantFlatCount: 2,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline60,
},
);
let trampoline61 = _trampoline61.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 61,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline61.manuallyAsync,
  paramLiftFns: [_liftFlatOwn({
    componentIdx: 0,
    className: OutgoingBody,
    createResourceFn: 
    (handle) => {
      const rep = handleTable12[(handle << 1) + 1] & ~T_FLAG;
      let resourceObj = captureTable12.get(rep);
      if (!resourceObj) {
        resourceObj = Object.create(OutgoingBody.prototype);
        Object.defineProperty(resourceObj, symbolRscHandle, { writable: true, value: handle });
        Object.defineProperty(resourceObj, symbolRscRep, { writable: true, value: rep });
      } else {
        captureTable12.delete(rep);
      }
      rscTableRemove(handleTable12, handle);
      return resourceObj;
    }
    ,
  })
  ,
  _liftFlatOption({
    caseMetas: [
    ['none', null, 0, 0, 0 ],
    ['some', _liftFlatOwn({
      componentIdx: 0,
      className: Fields,
      createResourceFn: 
      (handle) => {
        const rep = handleTable8[(handle << 1) + 1] & ~T_FLAG;
        let resourceObj = captureTable8.get(rep);
        if (!resourceObj) {
          resourceObj = Object.create(Fields.prototype);
          Object.defineProperty(resourceObj, symbolRscHandle, { writable: true, value: handle });
          Object.defineProperty(resourceObj, symbolRscRep, { writable: true, value: rep });
        } else {
          captureTable8.delete(rep);
        }
        rscTableRemove(handleTable8, handle);
        return resourceObj;
      }
      ,
    })
    , 4, 4, 1 ],
    ],
    variantSize32: 8,
    variantAlign32: 4,
    variantPayloadOffset32: 4,
    variantFlatCount: 2,
  })
  ],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', null, 40, 8, 8 ],
    [ 'err', _lowerFlatVariant({
      caseMetas: [[ 'DNS-timeout', null, 0, 0, 0 ],[ 'DNS-error', _lowerFlatRecord({ fieldMetas: [['rcode', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatStringAny, 8, 4, 2],
        ],
        variantSize32: 12,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 3,
      })
      , 12, 4 ],['infoCode', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatU16, 2, 2, 1],
        ],
        variantSize32: 4,
        variantAlign32: 2,
        variantPayloadOffset32: 2,
        variantFlatCount: 2,
      })
      , 4, 2 ],], size32: 16, align32: 4 }), 16, 4, 5 ],[ 'destination-not-found', null, 0, 0, 0 ],[ 'destination-unavailable', null, 0, 0, 0 ],[ 'destination-IP-prohibited', null, 0, 0, 0 ],[ 'destination-IP-unroutable', null, 0, 0, 0 ],[ 'connection-refused', null, 0, 0, 0 ],[ 'connection-terminated', null, 0, 0, 0 ],[ 'connection-timeout', null, 0, 0, 0 ],[ 'connection-read-timeout', null, 0, 0, 0 ],[ 'connection-write-timeout', null, 0, 0, 0 ],[ 'connection-limit-reached', null, 0, 0, 0 ],[ 'TLS-protocol-error', null, 0, 0, 0 ],[ 'TLS-certificate-error', null, 0, 0, 0 ],[ 'TLS-alert-received', _lowerFlatRecord({ fieldMetas: [['alertId', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatU8, 1, 1, 1],
        ],
        variantSize32: 2,
        variantAlign32: 1,
        variantPayloadOffset32: 1,
        variantFlatCount: 2,
      })
      , 2, 1 ],['alertMessage', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatStringAny, 8, 4, 2],
        ],
        variantSize32: 12,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 3,
      })
      , 12, 4 ],], size32: 16, align32: 4 }), 16, 4, 5 ],[ 'HTTP-request-denied', null, 0, 0, 0 ],[ 'HTTP-request-length-required', null, 0, 0, 0 ],[ 'HTTP-request-body-size', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatU64, 8, 8, 1],
        ],
        variantSize32: 16,
        variantAlign32: 8,
        variantPayloadOffset32: 8,
        variantFlatCount: 2,
      })
      , 16, 8, 2 ],[ 'HTTP-request-method-invalid', null, 0, 0, 0 ],[ 'HTTP-request-URI-invalid', null, 0, 0, 0 ],[ 'HTTP-request-URI-too-long', null, 0, 0, 0 ],[ 'HTTP-request-header-section-size', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatU32, 4, 4, 1],
        ],
        variantSize32: 8,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 2,
      })
      , 8, 4, 2 ],[ 'HTTP-request-header-size', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatRecord({ fieldMetas: [['fieldName', 
        _lowerFlatOption({
          caseMetas: [
          [ 'none', null, 0, 0, 0 ],
          [ 'some', _lowerFlatStringAny, 8, 4, 2],
          ],
          variantSize32: 12,
          variantAlign32: 4,
          variantPayloadOffset32: 4,
          variantFlatCount: 3,
        })
        , 12, 4 ],['fieldSize', 
        _lowerFlatOption({
          caseMetas: [
          [ 'none', null, 0, 0, 0 ],
          [ 'some', _lowerFlatU32, 4, 4, 1],
          ],
          variantSize32: 8,
          variantAlign32: 4,
          variantPayloadOffset32: 4,
          variantFlatCount: 2,
        })
        , 8, 4 ],], size32: 20, align32: 4 }), 20, 4, 5],
        ],
        variantSize32: 24,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 6,
      })
      , 24, 4, 6 ],[ 'HTTP-request-trailer-section-size', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatU32, 4, 4, 1],
        ],
        variantSize32: 8,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 2,
      })
      , 8, 4, 2 ],[ 'HTTP-request-trailer-size', _lowerFlatRecord({ fieldMetas: [['fieldName', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatStringAny, 8, 4, 2],
        ],
        variantSize32: 12,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 3,
      })
      , 12, 4 ],['fieldSize', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatU32, 4, 4, 1],
        ],
        variantSize32: 8,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 2,
      })
      , 8, 4 ],], size32: 20, align32: 4 }), 20, 4, 5 ],[ 'HTTP-response-incomplete', null, 0, 0, 0 ],[ 'HTTP-response-header-section-size', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatU32, 4, 4, 1],
        ],
        variantSize32: 8,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 2,
      })
      , 8, 4, 2 ],[ 'HTTP-response-header-size', _lowerFlatRecord({ fieldMetas: [['fieldName', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatStringAny, 8, 4, 2],
        ],
        variantSize32: 12,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 3,
      })
      , 12, 4 ],['fieldSize', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatU32, 4, 4, 1],
        ],
        variantSize32: 8,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 2,
      })
      , 8, 4 ],], size32: 20, align32: 4 }), 20, 4, 5 ],[ 'HTTP-response-body-size', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatU64, 8, 8, 1],
        ],
        variantSize32: 16,
        variantAlign32: 8,
        variantPayloadOffset32: 8,
        variantFlatCount: 2,
      })
      , 16, 8, 2 ],[ 'HTTP-response-trailer-section-size', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatU32, 4, 4, 1],
        ],
        variantSize32: 8,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 2,
      })
      , 8, 4, 2 ],[ 'HTTP-response-trailer-size', _lowerFlatRecord({ fieldMetas: [['fieldName', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatStringAny, 8, 4, 2],
        ],
        variantSize32: 12,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 3,
      })
      , 12, 4 ],['fieldSize', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatU32, 4, 4, 1],
        ],
        variantSize32: 8,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 2,
      })
      , 8, 4 ],], size32: 20, align32: 4 }), 20, 4, 5 ],[ 'HTTP-response-transfer-coding', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatStringAny, 8, 4, 2],
        ],
        variantSize32: 12,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 3,
      })
      , 12, 4, 3 ],[ 'HTTP-response-content-coding', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatStringAny, 8, 4, 2],
        ],
        variantSize32: 12,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 3,
      })
      , 12, 4, 3 ],[ 'HTTP-response-timeout', null, 0, 0, 0 ],[ 'HTTP-upgrade-failed', null, 0, 0, 0 ],[ 'HTTP-protocol-error', null, 0, 0, 0 ],[ 'loop-detected', null, 0, 0, 0 ],[ 'configuration-error', null, 0, 0, 0 ],[ 'internal-error', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatStringAny, 8, 4, 2],
        ],
        variantSize32: 12,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 3,
      })
      , 12, 4, 3 ],],
      variantSize32: 32,
      variantAlign32: 8,
      variantPayloadOffset32: 8,
      variantFlatCount: 7,
    } ), 40, 8, 8 ],
    ],
    variantSize32: 40,
    variantAlign32: 8,
    variantPayloadOffset32: 8,
    variantFlatCount: 8,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: () => realloc0,
  importFn: _trampoline61,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 61,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline61.manuallyAsync,
  paramLiftFns: [_liftFlatOwn({
    componentIdx: 0,
    className: OutgoingBody,
    createResourceFn: 
    (handle) => {
      const rep = handleTable12[(handle << 1) + 1] & ~T_FLAG;
      let resourceObj = captureTable12.get(rep);
      if (!resourceObj) {
        resourceObj = Object.create(OutgoingBody.prototype);
        Object.defineProperty(resourceObj, symbolRscHandle, { writable: true, value: handle });
        Object.defineProperty(resourceObj, symbolRscRep, { writable: true, value: rep });
      } else {
        captureTable12.delete(rep);
      }
      rscTableRemove(handleTable12, handle);
      return resourceObj;
    }
    ,
  })
  ,
  _liftFlatOption({
    caseMetas: [
    ['none', null, 0, 0, 0 ],
    ['some', _liftFlatOwn({
      componentIdx: 0,
      className: Fields,
      createResourceFn: 
      (handle) => {
        const rep = handleTable8[(handle << 1) + 1] & ~T_FLAG;
        let resourceObj = captureTable8.get(rep);
        if (!resourceObj) {
          resourceObj = Object.create(Fields.prototype);
          Object.defineProperty(resourceObj, symbolRscHandle, { writable: true, value: handle });
          Object.defineProperty(resourceObj, symbolRscRep, { writable: true, value: rep });
        } else {
          captureTable8.delete(rep);
        }
        rscTableRemove(handleTable8, handle);
        return resourceObj;
      }
      ,
    })
    , 4, 4, 1 ],
    ],
    variantSize32: 8,
    variantAlign32: 4,
    variantPayloadOffset32: 4,
    variantFlatCount: 2,
  })
  ],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', null, 40, 8, 8 ],
    [ 'err', _lowerFlatVariant({
      caseMetas: [[ 'DNS-timeout', null, 0, 0, 0 ],[ 'DNS-error', _lowerFlatRecord({ fieldMetas: [['rcode', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatStringAny, 8, 4, 2],
        ],
        variantSize32: 12,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 3,
      })
      , 12, 4 ],['infoCode', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatU16, 2, 2, 1],
        ],
        variantSize32: 4,
        variantAlign32: 2,
        variantPayloadOffset32: 2,
        variantFlatCount: 2,
      })
      , 4, 2 ],], size32: 16, align32: 4 }), 16, 4, 5 ],[ 'destination-not-found', null, 0, 0, 0 ],[ 'destination-unavailable', null, 0, 0, 0 ],[ 'destination-IP-prohibited', null, 0, 0, 0 ],[ 'destination-IP-unroutable', null, 0, 0, 0 ],[ 'connection-refused', null, 0, 0, 0 ],[ 'connection-terminated', null, 0, 0, 0 ],[ 'connection-timeout', null, 0, 0, 0 ],[ 'connection-read-timeout', null, 0, 0, 0 ],[ 'connection-write-timeout', null, 0, 0, 0 ],[ 'connection-limit-reached', null, 0, 0, 0 ],[ 'TLS-protocol-error', null, 0, 0, 0 ],[ 'TLS-certificate-error', null, 0, 0, 0 ],[ 'TLS-alert-received', _lowerFlatRecord({ fieldMetas: [['alertId', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatU8, 1, 1, 1],
        ],
        variantSize32: 2,
        variantAlign32: 1,
        variantPayloadOffset32: 1,
        variantFlatCount: 2,
      })
      , 2, 1 ],['alertMessage', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatStringAny, 8, 4, 2],
        ],
        variantSize32: 12,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 3,
      })
      , 12, 4 ],], size32: 16, align32: 4 }), 16, 4, 5 ],[ 'HTTP-request-denied', null, 0, 0, 0 ],[ 'HTTP-request-length-required', null, 0, 0, 0 ],[ 'HTTP-request-body-size', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatU64, 8, 8, 1],
        ],
        variantSize32: 16,
        variantAlign32: 8,
        variantPayloadOffset32: 8,
        variantFlatCount: 2,
      })
      , 16, 8, 2 ],[ 'HTTP-request-method-invalid', null, 0, 0, 0 ],[ 'HTTP-request-URI-invalid', null, 0, 0, 0 ],[ 'HTTP-request-URI-too-long', null, 0, 0, 0 ],[ 'HTTP-request-header-section-size', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatU32, 4, 4, 1],
        ],
        variantSize32: 8,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 2,
      })
      , 8, 4, 2 ],[ 'HTTP-request-header-size', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatRecord({ fieldMetas: [['fieldName', 
        _lowerFlatOption({
          caseMetas: [
          [ 'none', null, 0, 0, 0 ],
          [ 'some', _lowerFlatStringAny, 8, 4, 2],
          ],
          variantSize32: 12,
          variantAlign32: 4,
          variantPayloadOffset32: 4,
          variantFlatCount: 3,
        })
        , 12, 4 ],['fieldSize', 
        _lowerFlatOption({
          caseMetas: [
          [ 'none', null, 0, 0, 0 ],
          [ 'some', _lowerFlatU32, 4, 4, 1],
          ],
          variantSize32: 8,
          variantAlign32: 4,
          variantPayloadOffset32: 4,
          variantFlatCount: 2,
        })
        , 8, 4 ],], size32: 20, align32: 4 }), 20, 4, 5],
        ],
        variantSize32: 24,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 6,
      })
      , 24, 4, 6 ],[ 'HTTP-request-trailer-section-size', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatU32, 4, 4, 1],
        ],
        variantSize32: 8,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 2,
      })
      , 8, 4, 2 ],[ 'HTTP-request-trailer-size', _lowerFlatRecord({ fieldMetas: [['fieldName', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatStringAny, 8, 4, 2],
        ],
        variantSize32: 12,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 3,
      })
      , 12, 4 ],['fieldSize', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatU32, 4, 4, 1],
        ],
        variantSize32: 8,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 2,
      })
      , 8, 4 ],], size32: 20, align32: 4 }), 20, 4, 5 ],[ 'HTTP-response-incomplete', null, 0, 0, 0 ],[ 'HTTP-response-header-section-size', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatU32, 4, 4, 1],
        ],
        variantSize32: 8,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 2,
      })
      , 8, 4, 2 ],[ 'HTTP-response-header-size', _lowerFlatRecord({ fieldMetas: [['fieldName', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatStringAny, 8, 4, 2],
        ],
        variantSize32: 12,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 3,
      })
      , 12, 4 ],['fieldSize', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatU32, 4, 4, 1],
        ],
        variantSize32: 8,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 2,
      })
      , 8, 4 ],], size32: 20, align32: 4 }), 20, 4, 5 ],[ 'HTTP-response-body-size', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatU64, 8, 8, 1],
        ],
        variantSize32: 16,
        variantAlign32: 8,
        variantPayloadOffset32: 8,
        variantFlatCount: 2,
      })
      , 16, 8, 2 ],[ 'HTTP-response-trailer-section-size', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatU32, 4, 4, 1],
        ],
        variantSize32: 8,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 2,
      })
      , 8, 4, 2 ],[ 'HTTP-response-trailer-size', _lowerFlatRecord({ fieldMetas: [['fieldName', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatStringAny, 8, 4, 2],
        ],
        variantSize32: 12,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 3,
      })
      , 12, 4 ],['fieldSize', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatU32, 4, 4, 1],
        ],
        variantSize32: 8,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 2,
      })
      , 8, 4 ],], size32: 20, align32: 4 }), 20, 4, 5 ],[ 'HTTP-response-transfer-coding', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatStringAny, 8, 4, 2],
        ],
        variantSize32: 12,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 3,
      })
      , 12, 4, 3 ],[ 'HTTP-response-content-coding', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatStringAny, 8, 4, 2],
        ],
        variantSize32: 12,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 3,
      })
      , 12, 4, 3 ],[ 'HTTP-response-timeout', null, 0, 0, 0 ],[ 'HTTP-upgrade-failed', null, 0, 0, 0 ],[ 'HTTP-protocol-error', null, 0, 0, 0 ],[ 'loop-detected', null, 0, 0, 0 ],[ 'configuration-error', null, 0, 0, 0 ],[ 'internal-error', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatStringAny, 8, 4, 2],
        ],
        variantSize32: 12,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 3,
      })
      , 12, 4, 3 ],],
      variantSize32: 32,
      variantAlign32: 8,
      variantPayloadOffset32: 8,
      variantFlatCount: 7,
    } ), 40, 8, 8 ],
    ],
    variantSize32: 40,
    variantAlign32: 8,
    variantPayloadOffset32: 8,
    variantFlatCount: 8,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: () => realloc0,
  importFn: _trampoline61,
},
);
let trampoline62 = _trampoline62.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 62,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline62.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 16)],
  resultLowerFns: [
  _lowerFlatOption({
    caseMetas: [
    [ 'none', null, 0, 0, 0 ],
    [ 'some', 
    _lowerFlatResult({
      caseMetas: [
      [ 'ok', 
      _lowerFlatResult({
        caseMetas: [
        [ 'ok', _lowerFlatOwn({
          componentIdx: 0,
          lowerFn: 
          function lowerImportedOwnedHost_IncomingResponse(obj) {
            if (!(obj instanceof IncomingResponse)) {
              throw new TypeError('Resource error: Not a valid \"IncomingResponse\" resource.');
            }
            let handle = obj[symbolRscHandle];
            if (!handle) {
              const rep = obj[symbolRscRep] || ++captureCnt15;
              captureTable15.set(rep, obj);
              handle = rscTableCreateOwn(handleTable15, rep);
            }
            return handle;
          }
          ,
        }), 40, 8, 8 ],
        [ 'err', _lowerFlatVariant({
          caseMetas: [[ 'DNS-timeout', null, 0, 0, 0 ],[ 'DNS-error', _lowerFlatRecord({ fieldMetas: [['rcode', 
          _lowerFlatOption({
            caseMetas: [
            [ 'none', null, 0, 0, 0 ],
            [ 'some', _lowerFlatStringAny, 8, 4, 2],
            ],
            variantSize32: 12,
            variantAlign32: 4,
            variantPayloadOffset32: 4,
            variantFlatCount: 3,
          })
          , 12, 4 ],['infoCode', 
          _lowerFlatOption({
            caseMetas: [
            [ 'none', null, 0, 0, 0 ],
            [ 'some', _lowerFlatU16, 2, 2, 1],
            ],
            variantSize32: 4,
            variantAlign32: 2,
            variantPayloadOffset32: 2,
            variantFlatCount: 2,
          })
          , 4, 2 ],], size32: 16, align32: 4 }), 16, 4, 5 ],[ 'destination-not-found', null, 0, 0, 0 ],[ 'destination-unavailable', null, 0, 0, 0 ],[ 'destination-IP-prohibited', null, 0, 0, 0 ],[ 'destination-IP-unroutable', null, 0, 0, 0 ],[ 'connection-refused', null, 0, 0, 0 ],[ 'connection-terminated', null, 0, 0, 0 ],[ 'connection-timeout', null, 0, 0, 0 ],[ 'connection-read-timeout', null, 0, 0, 0 ],[ 'connection-write-timeout', null, 0, 0, 0 ],[ 'connection-limit-reached', null, 0, 0, 0 ],[ 'TLS-protocol-error', null, 0, 0, 0 ],[ 'TLS-certificate-error', null, 0, 0, 0 ],[ 'TLS-alert-received', _lowerFlatRecord({ fieldMetas: [['alertId', 
          _lowerFlatOption({
            caseMetas: [
            [ 'none', null, 0, 0, 0 ],
            [ 'some', _lowerFlatU8, 1, 1, 1],
            ],
            variantSize32: 2,
            variantAlign32: 1,
            variantPayloadOffset32: 1,
            variantFlatCount: 2,
          })
          , 2, 1 ],['alertMessage', 
          _lowerFlatOption({
            caseMetas: [
            [ 'none', null, 0, 0, 0 ],
            [ 'some', _lowerFlatStringAny, 8, 4, 2],
            ],
            variantSize32: 12,
            variantAlign32: 4,
            variantPayloadOffset32: 4,
            variantFlatCount: 3,
          })
          , 12, 4 ],], size32: 16, align32: 4 }), 16, 4, 5 ],[ 'HTTP-request-denied', null, 0, 0, 0 ],[ 'HTTP-request-length-required', null, 0, 0, 0 ],[ 'HTTP-request-body-size', 
          _lowerFlatOption({
            caseMetas: [
            [ 'none', null, 0, 0, 0 ],
            [ 'some', _lowerFlatU64, 8, 8, 1],
            ],
            variantSize32: 16,
            variantAlign32: 8,
            variantPayloadOffset32: 8,
            variantFlatCount: 2,
          })
          , 16, 8, 2 ],[ 'HTTP-request-method-invalid', null, 0, 0, 0 ],[ 'HTTP-request-URI-invalid', null, 0, 0, 0 ],[ 'HTTP-request-URI-too-long', null, 0, 0, 0 ],[ 'HTTP-request-header-section-size', 
          _lowerFlatOption({
            caseMetas: [
            [ 'none', null, 0, 0, 0 ],
            [ 'some', _lowerFlatU32, 4, 4, 1],
            ],
            variantSize32: 8,
            variantAlign32: 4,
            variantPayloadOffset32: 4,
            variantFlatCount: 2,
          })
          , 8, 4, 2 ],[ 'HTTP-request-header-size', 
          _lowerFlatOption({
            caseMetas: [
            [ 'none', null, 0, 0, 0 ],
            [ 'some', _lowerFlatRecord({ fieldMetas: [['fieldName', 
            _lowerFlatOption({
              caseMetas: [
              [ 'none', null, 0, 0, 0 ],
              [ 'some', _lowerFlatStringAny, 8, 4, 2],
              ],
              variantSize32: 12,
              variantAlign32: 4,
              variantPayloadOffset32: 4,
              variantFlatCount: 3,
            })
            , 12, 4 ],['fieldSize', 
            _lowerFlatOption({
              caseMetas: [
              [ 'none', null, 0, 0, 0 ],
              [ 'some', _lowerFlatU32, 4, 4, 1],
              ],
              variantSize32: 8,
              variantAlign32: 4,
              variantPayloadOffset32: 4,
              variantFlatCount: 2,
            })
            , 8, 4 ],], size32: 20, align32: 4 }), 20, 4, 5],
            ],
            variantSize32: 24,
            variantAlign32: 4,
            variantPayloadOffset32: 4,
            variantFlatCount: 6,
          })
          , 24, 4, 6 ],[ 'HTTP-request-trailer-section-size', 
          _lowerFlatOption({
            caseMetas: [
            [ 'none', null, 0, 0, 0 ],
            [ 'some', _lowerFlatU32, 4, 4, 1],
            ],
            variantSize32: 8,
            variantAlign32: 4,
            variantPayloadOffset32: 4,
            variantFlatCount: 2,
          })
          , 8, 4, 2 ],[ 'HTTP-request-trailer-size', _lowerFlatRecord({ fieldMetas: [['fieldName', 
          _lowerFlatOption({
            caseMetas: [
            [ 'none', null, 0, 0, 0 ],
            [ 'some', _lowerFlatStringAny, 8, 4, 2],
            ],
            variantSize32: 12,
            variantAlign32: 4,
            variantPayloadOffset32: 4,
            variantFlatCount: 3,
          })
          , 12, 4 ],['fieldSize', 
          _lowerFlatOption({
            caseMetas: [
            [ 'none', null, 0, 0, 0 ],
            [ 'some', _lowerFlatU32, 4, 4, 1],
            ],
            variantSize32: 8,
            variantAlign32: 4,
            variantPayloadOffset32: 4,
            variantFlatCount: 2,
          })
          , 8, 4 ],], size32: 20, align32: 4 }), 20, 4, 5 ],[ 'HTTP-response-incomplete', null, 0, 0, 0 ],[ 'HTTP-response-header-section-size', 
          _lowerFlatOption({
            caseMetas: [
            [ 'none', null, 0, 0, 0 ],
            [ 'some', _lowerFlatU32, 4, 4, 1],
            ],
            variantSize32: 8,
            variantAlign32: 4,
            variantPayloadOffset32: 4,
            variantFlatCount: 2,
          })
          , 8, 4, 2 ],[ 'HTTP-response-header-size', _lowerFlatRecord({ fieldMetas: [['fieldName', 
          _lowerFlatOption({
            caseMetas: [
            [ 'none', null, 0, 0, 0 ],
            [ 'some', _lowerFlatStringAny, 8, 4, 2],
            ],
            variantSize32: 12,
            variantAlign32: 4,
            variantPayloadOffset32: 4,
            variantFlatCount: 3,
          })
          , 12, 4 ],['fieldSize', 
          _lowerFlatOption({
            caseMetas: [
            [ 'none', null, 0, 0, 0 ],
            [ 'some', _lowerFlatU32, 4, 4, 1],
            ],
            variantSize32: 8,
            variantAlign32: 4,
            variantPayloadOffset32: 4,
            variantFlatCount: 2,
          })
          , 8, 4 ],], size32: 20, align32: 4 }), 20, 4, 5 ],[ 'HTTP-response-body-size', 
          _lowerFlatOption({
            caseMetas: [
            [ 'none', null, 0, 0, 0 ],
            [ 'some', _lowerFlatU64, 8, 8, 1],
            ],
            variantSize32: 16,
            variantAlign32: 8,
            variantPayloadOffset32: 8,
            variantFlatCount: 2,
          })
          , 16, 8, 2 ],[ 'HTTP-response-trailer-section-size', 
          _lowerFlatOption({
            caseMetas: [
            [ 'none', null, 0, 0, 0 ],
            [ 'some', _lowerFlatU32, 4, 4, 1],
            ],
            variantSize32: 8,
            variantAlign32: 4,
            variantPayloadOffset32: 4,
            variantFlatCount: 2,
          })
          , 8, 4, 2 ],[ 'HTTP-response-trailer-size', _lowerFlatRecord({ fieldMetas: [['fieldName', 
          _lowerFlatOption({
            caseMetas: [
            [ 'none', null, 0, 0, 0 ],
            [ 'some', _lowerFlatStringAny, 8, 4, 2],
            ],
            variantSize32: 12,
            variantAlign32: 4,
            variantPayloadOffset32: 4,
            variantFlatCount: 3,
          })
          , 12, 4 ],['fieldSize', 
          _lowerFlatOption({
            caseMetas: [
            [ 'none', null, 0, 0, 0 ],
            [ 'some', _lowerFlatU32, 4, 4, 1],
            ],
            variantSize32: 8,
            variantAlign32: 4,
            variantPayloadOffset32: 4,
            variantFlatCount: 2,
          })
          , 8, 4 ],], size32: 20, align32: 4 }), 20, 4, 5 ],[ 'HTTP-response-transfer-coding', 
          _lowerFlatOption({
            caseMetas: [
            [ 'none', null, 0, 0, 0 ],
            [ 'some', _lowerFlatStringAny, 8, 4, 2],
            ],
            variantSize32: 12,
            variantAlign32: 4,
            variantPayloadOffset32: 4,
            variantFlatCount: 3,
          })
          , 12, 4, 3 ],[ 'HTTP-response-content-coding', 
          _lowerFlatOption({
            caseMetas: [
            [ 'none', null, 0, 0, 0 ],
            [ 'some', _lowerFlatStringAny, 8, 4, 2],
            ],
            variantSize32: 12,
            variantAlign32: 4,
            variantPayloadOffset32: 4,
            variantFlatCount: 3,
          })
          , 12, 4, 3 ],[ 'HTTP-response-timeout', null, 0, 0, 0 ],[ 'HTTP-upgrade-failed', null, 0, 0, 0 ],[ 'HTTP-protocol-error', null, 0, 0, 0 ],[ 'loop-detected', null, 0, 0, 0 ],[ 'configuration-error', null, 0, 0, 0 ],[ 'internal-error', 
          _lowerFlatOption({
            caseMetas: [
            [ 'none', null, 0, 0, 0 ],
            [ 'some', _lowerFlatStringAny, 8, 4, 2],
            ],
            variantSize32: 12,
            variantAlign32: 4,
            variantPayloadOffset32: 4,
            variantFlatCount: 3,
          })
          , 12, 4, 3 ],],
          variantSize32: 32,
          variantAlign32: 8,
          variantPayloadOffset32: 8,
          variantFlatCount: 7,
        } ), 40, 8, 8 ],
        ],
        variantSize32: 40,
        variantAlign32: 8,
        variantPayloadOffset32: 8,
        variantFlatCount: 8,
      })
      , 48, 8, 8 ],
      [ 'err', null, 48, 8, 8 ],
      ],
      variantSize32: 48,
      variantAlign32: 8,
      variantPayloadOffset32: 8,
      variantFlatCount: 9,
    })
    , 48, 8, 9],
    ],
    variantSize32: 56,
    variantAlign32: 8,
    variantPayloadOffset32: 8,
    variantFlatCount: 10,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: () => realloc0,
  importFn: _trampoline62,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 62,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline62.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 16)],
  resultLowerFns: [
  _lowerFlatOption({
    caseMetas: [
    [ 'none', null, 0, 0, 0 ],
    [ 'some', 
    _lowerFlatResult({
      caseMetas: [
      [ 'ok', 
      _lowerFlatResult({
        caseMetas: [
        [ 'ok', _lowerFlatOwn({
          componentIdx: 0,
          lowerFn: 
          function lowerImportedOwnedHost_IncomingResponse(obj) {
            if (!(obj instanceof IncomingResponse)) {
              throw new TypeError('Resource error: Not a valid \"IncomingResponse\" resource.');
            }
            let handle = obj[symbolRscHandle];
            if (!handle) {
              const rep = obj[symbolRscRep] || ++captureCnt15;
              captureTable15.set(rep, obj);
              handle = rscTableCreateOwn(handleTable15, rep);
            }
            return handle;
          }
          ,
        }), 40, 8, 8 ],
        [ 'err', _lowerFlatVariant({
          caseMetas: [[ 'DNS-timeout', null, 0, 0, 0 ],[ 'DNS-error', _lowerFlatRecord({ fieldMetas: [['rcode', 
          _lowerFlatOption({
            caseMetas: [
            [ 'none', null, 0, 0, 0 ],
            [ 'some', _lowerFlatStringAny, 8, 4, 2],
            ],
            variantSize32: 12,
            variantAlign32: 4,
            variantPayloadOffset32: 4,
            variantFlatCount: 3,
          })
          , 12, 4 ],['infoCode', 
          _lowerFlatOption({
            caseMetas: [
            [ 'none', null, 0, 0, 0 ],
            [ 'some', _lowerFlatU16, 2, 2, 1],
            ],
            variantSize32: 4,
            variantAlign32: 2,
            variantPayloadOffset32: 2,
            variantFlatCount: 2,
          })
          , 4, 2 ],], size32: 16, align32: 4 }), 16, 4, 5 ],[ 'destination-not-found', null, 0, 0, 0 ],[ 'destination-unavailable', null, 0, 0, 0 ],[ 'destination-IP-prohibited', null, 0, 0, 0 ],[ 'destination-IP-unroutable', null, 0, 0, 0 ],[ 'connection-refused', null, 0, 0, 0 ],[ 'connection-terminated', null, 0, 0, 0 ],[ 'connection-timeout', null, 0, 0, 0 ],[ 'connection-read-timeout', null, 0, 0, 0 ],[ 'connection-write-timeout', null, 0, 0, 0 ],[ 'connection-limit-reached', null, 0, 0, 0 ],[ 'TLS-protocol-error', null, 0, 0, 0 ],[ 'TLS-certificate-error', null, 0, 0, 0 ],[ 'TLS-alert-received', _lowerFlatRecord({ fieldMetas: [['alertId', 
          _lowerFlatOption({
            caseMetas: [
            [ 'none', null, 0, 0, 0 ],
            [ 'some', _lowerFlatU8, 1, 1, 1],
            ],
            variantSize32: 2,
            variantAlign32: 1,
            variantPayloadOffset32: 1,
            variantFlatCount: 2,
          })
          , 2, 1 ],['alertMessage', 
          _lowerFlatOption({
            caseMetas: [
            [ 'none', null, 0, 0, 0 ],
            [ 'some', _lowerFlatStringAny, 8, 4, 2],
            ],
            variantSize32: 12,
            variantAlign32: 4,
            variantPayloadOffset32: 4,
            variantFlatCount: 3,
          })
          , 12, 4 ],], size32: 16, align32: 4 }), 16, 4, 5 ],[ 'HTTP-request-denied', null, 0, 0, 0 ],[ 'HTTP-request-length-required', null, 0, 0, 0 ],[ 'HTTP-request-body-size', 
          _lowerFlatOption({
            caseMetas: [
            [ 'none', null, 0, 0, 0 ],
            [ 'some', _lowerFlatU64, 8, 8, 1],
            ],
            variantSize32: 16,
            variantAlign32: 8,
            variantPayloadOffset32: 8,
            variantFlatCount: 2,
          })
          , 16, 8, 2 ],[ 'HTTP-request-method-invalid', null, 0, 0, 0 ],[ 'HTTP-request-URI-invalid', null, 0, 0, 0 ],[ 'HTTP-request-URI-too-long', null, 0, 0, 0 ],[ 'HTTP-request-header-section-size', 
          _lowerFlatOption({
            caseMetas: [
            [ 'none', null, 0, 0, 0 ],
            [ 'some', _lowerFlatU32, 4, 4, 1],
            ],
            variantSize32: 8,
            variantAlign32: 4,
            variantPayloadOffset32: 4,
            variantFlatCount: 2,
          })
          , 8, 4, 2 ],[ 'HTTP-request-header-size', 
          _lowerFlatOption({
            caseMetas: [
            [ 'none', null, 0, 0, 0 ],
            [ 'some', _lowerFlatRecord({ fieldMetas: [['fieldName', 
            _lowerFlatOption({
              caseMetas: [
              [ 'none', null, 0, 0, 0 ],
              [ 'some', _lowerFlatStringAny, 8, 4, 2],
              ],
              variantSize32: 12,
              variantAlign32: 4,
              variantPayloadOffset32: 4,
              variantFlatCount: 3,
            })
            , 12, 4 ],['fieldSize', 
            _lowerFlatOption({
              caseMetas: [
              [ 'none', null, 0, 0, 0 ],
              [ 'some', _lowerFlatU32, 4, 4, 1],
              ],
              variantSize32: 8,
              variantAlign32: 4,
              variantPayloadOffset32: 4,
              variantFlatCount: 2,
            })
            , 8, 4 ],], size32: 20, align32: 4 }), 20, 4, 5],
            ],
            variantSize32: 24,
            variantAlign32: 4,
            variantPayloadOffset32: 4,
            variantFlatCount: 6,
          })
          , 24, 4, 6 ],[ 'HTTP-request-trailer-section-size', 
          _lowerFlatOption({
            caseMetas: [
            [ 'none', null, 0, 0, 0 ],
            [ 'some', _lowerFlatU32, 4, 4, 1],
            ],
            variantSize32: 8,
            variantAlign32: 4,
            variantPayloadOffset32: 4,
            variantFlatCount: 2,
          })
          , 8, 4, 2 ],[ 'HTTP-request-trailer-size', _lowerFlatRecord({ fieldMetas: [['fieldName', 
          _lowerFlatOption({
            caseMetas: [
            [ 'none', null, 0, 0, 0 ],
            [ 'some', _lowerFlatStringAny, 8, 4, 2],
            ],
            variantSize32: 12,
            variantAlign32: 4,
            variantPayloadOffset32: 4,
            variantFlatCount: 3,
          })
          , 12, 4 ],['fieldSize', 
          _lowerFlatOption({
            caseMetas: [
            [ 'none', null, 0, 0, 0 ],
            [ 'some', _lowerFlatU32, 4, 4, 1],
            ],
            variantSize32: 8,
            variantAlign32: 4,
            variantPayloadOffset32: 4,
            variantFlatCount: 2,
          })
          , 8, 4 ],], size32: 20, align32: 4 }), 20, 4, 5 ],[ 'HTTP-response-incomplete', null, 0, 0, 0 ],[ 'HTTP-response-header-section-size', 
          _lowerFlatOption({
            caseMetas: [
            [ 'none', null, 0, 0, 0 ],
            [ 'some', _lowerFlatU32, 4, 4, 1],
            ],
            variantSize32: 8,
            variantAlign32: 4,
            variantPayloadOffset32: 4,
            variantFlatCount: 2,
          })
          , 8, 4, 2 ],[ 'HTTP-response-header-size', _lowerFlatRecord({ fieldMetas: [['fieldName', 
          _lowerFlatOption({
            caseMetas: [
            [ 'none', null, 0, 0, 0 ],
            [ 'some', _lowerFlatStringAny, 8, 4, 2],
            ],
            variantSize32: 12,
            variantAlign32: 4,
            variantPayloadOffset32: 4,
            variantFlatCount: 3,
          })
          , 12, 4 ],['fieldSize', 
          _lowerFlatOption({
            caseMetas: [
            [ 'none', null, 0, 0, 0 ],
            [ 'some', _lowerFlatU32, 4, 4, 1],
            ],
            variantSize32: 8,
            variantAlign32: 4,
            variantPayloadOffset32: 4,
            variantFlatCount: 2,
          })
          , 8, 4 ],], size32: 20, align32: 4 }), 20, 4, 5 ],[ 'HTTP-response-body-size', 
          _lowerFlatOption({
            caseMetas: [
            [ 'none', null, 0, 0, 0 ],
            [ 'some', _lowerFlatU64, 8, 8, 1],
            ],
            variantSize32: 16,
            variantAlign32: 8,
            variantPayloadOffset32: 8,
            variantFlatCount: 2,
          })
          , 16, 8, 2 ],[ 'HTTP-response-trailer-section-size', 
          _lowerFlatOption({
            caseMetas: [
            [ 'none', null, 0, 0, 0 ],
            [ 'some', _lowerFlatU32, 4, 4, 1],
            ],
            variantSize32: 8,
            variantAlign32: 4,
            variantPayloadOffset32: 4,
            variantFlatCount: 2,
          })
          , 8, 4, 2 ],[ 'HTTP-response-trailer-size', _lowerFlatRecord({ fieldMetas: [['fieldName', 
          _lowerFlatOption({
            caseMetas: [
            [ 'none', null, 0, 0, 0 ],
            [ 'some', _lowerFlatStringAny, 8, 4, 2],
            ],
            variantSize32: 12,
            variantAlign32: 4,
            variantPayloadOffset32: 4,
            variantFlatCount: 3,
          })
          , 12, 4 ],['fieldSize', 
          _lowerFlatOption({
            caseMetas: [
            [ 'none', null, 0, 0, 0 ],
            [ 'some', _lowerFlatU32, 4, 4, 1],
            ],
            variantSize32: 8,
            variantAlign32: 4,
            variantPayloadOffset32: 4,
            variantFlatCount: 2,
          })
          , 8, 4 ],], size32: 20, align32: 4 }), 20, 4, 5 ],[ 'HTTP-response-transfer-coding', 
          _lowerFlatOption({
            caseMetas: [
            [ 'none', null, 0, 0, 0 ],
            [ 'some', _lowerFlatStringAny, 8, 4, 2],
            ],
            variantSize32: 12,
            variantAlign32: 4,
            variantPayloadOffset32: 4,
            variantFlatCount: 3,
          })
          , 12, 4, 3 ],[ 'HTTP-response-content-coding', 
          _lowerFlatOption({
            caseMetas: [
            [ 'none', null, 0, 0, 0 ],
            [ 'some', _lowerFlatStringAny, 8, 4, 2],
            ],
            variantSize32: 12,
            variantAlign32: 4,
            variantPayloadOffset32: 4,
            variantFlatCount: 3,
          })
          , 12, 4, 3 ],[ 'HTTP-response-timeout', null, 0, 0, 0 ],[ 'HTTP-upgrade-failed', null, 0, 0, 0 ],[ 'HTTP-protocol-error', null, 0, 0, 0 ],[ 'loop-detected', null, 0, 0, 0 ],[ 'configuration-error', null, 0, 0, 0 ],[ 'internal-error', 
          _lowerFlatOption({
            caseMetas: [
            [ 'none', null, 0, 0, 0 ],
            [ 'some', _lowerFlatStringAny, 8, 4, 2],
            ],
            variantSize32: 12,
            variantAlign32: 4,
            variantPayloadOffset32: 4,
            variantFlatCount: 3,
          })
          , 12, 4, 3 ],],
          variantSize32: 32,
          variantAlign32: 8,
          variantPayloadOffset32: 8,
          variantFlatCount: 7,
        } ), 40, 8, 8 ],
        ],
        variantSize32: 40,
        variantAlign32: 8,
        variantPayloadOffset32: 8,
        variantFlatCount: 8,
      })
      , 48, 8, 8 ],
      [ 'err', null, 48, 8, 8 ],
      ],
      variantSize32: 48,
      variantAlign32: 8,
      variantPayloadOffset32: 8,
      variantFlatCount: 9,
    })
    , 48, 8, 9],
    ],
    variantSize32: 56,
    variantAlign32: 8,
    variantPayloadOffset32: 8,
    variantFlatCount: 10,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: () => realloc0,
  importFn: _trampoline62,
},
);
let trampoline63 = _trampoline63.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 63,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline63.manuallyAsync,
  paramLiftFns: [_liftFlatOwn({
    componentIdx: 0,
    className: OutgoingRequest,
    createResourceFn: 
    (handle) => {
      const rep = handleTable11[(handle << 1) + 1] & ~T_FLAG;
      let resourceObj = captureTable11.get(rep);
      if (!resourceObj) {
        resourceObj = Object.create(OutgoingRequest.prototype);
        Object.defineProperty(resourceObj, symbolRscHandle, { writable: true, value: handle });
        Object.defineProperty(resourceObj, symbolRscRep, { writable: true, value: rep });
      } else {
        captureTable11.delete(rep);
      }
      rscTableRemove(handleTable11, handle);
      return resourceObj;
    }
    ,
  })
  ,
  _liftFlatOption({
    caseMetas: [
    ['none', null, 0, 0, 0 ],
    ['some', _liftFlatOwn({
      componentIdx: 0,
      className: RequestOptions,
      createResourceFn: 
      (handle) => {
        const rep = handleTable17[(handle << 1) + 1] & ~T_FLAG;
        let resourceObj = captureTable17.get(rep);
        if (!resourceObj) {
          resourceObj = Object.create(RequestOptions.prototype);
          Object.defineProperty(resourceObj, symbolRscHandle, { writable: true, value: handle });
          Object.defineProperty(resourceObj, symbolRscRep, { writable: true, value: rep });
        } else {
          captureTable17.delete(rep);
        }
        rscTableRemove(handleTable17, handle);
        return resourceObj;
      }
      ,
    })
    , 4, 4, 1 ],
    ],
    variantSize32: 8,
    variantAlign32: 4,
    variantPayloadOffset32: 4,
    variantFlatCount: 2,
  })
  ],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', _lowerFlatOwn({
      componentIdx: 0,
      lowerFn: 
      function lowerImportedOwnedHost_FutureIncomingResponse(obj) {
        if (!(obj instanceof FutureIncomingResponse)) {
          throw new TypeError('Resource error: Not a valid \"FutureIncomingResponse\" resource.');
        }
        let handle = obj[symbolRscHandle];
        if (!handle) {
          const rep = obj[symbolRscRep] || ++captureCnt16;
          captureTable16.set(rep, obj);
          handle = rscTableCreateOwn(handleTable16, rep);
        }
        return handle;
      }
      ,
    }), 40, 8, 8 ],
    [ 'err', _lowerFlatVariant({
      caseMetas: [[ 'DNS-timeout', null, 0, 0, 0 ],[ 'DNS-error', _lowerFlatRecord({ fieldMetas: [['rcode', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatStringAny, 8, 4, 2],
        ],
        variantSize32: 12,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 3,
      })
      , 12, 4 ],['infoCode', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatU16, 2, 2, 1],
        ],
        variantSize32: 4,
        variantAlign32: 2,
        variantPayloadOffset32: 2,
        variantFlatCount: 2,
      })
      , 4, 2 ],], size32: 16, align32: 4 }), 16, 4, 5 ],[ 'destination-not-found', null, 0, 0, 0 ],[ 'destination-unavailable', null, 0, 0, 0 ],[ 'destination-IP-prohibited', null, 0, 0, 0 ],[ 'destination-IP-unroutable', null, 0, 0, 0 ],[ 'connection-refused', null, 0, 0, 0 ],[ 'connection-terminated', null, 0, 0, 0 ],[ 'connection-timeout', null, 0, 0, 0 ],[ 'connection-read-timeout', null, 0, 0, 0 ],[ 'connection-write-timeout', null, 0, 0, 0 ],[ 'connection-limit-reached', null, 0, 0, 0 ],[ 'TLS-protocol-error', null, 0, 0, 0 ],[ 'TLS-certificate-error', null, 0, 0, 0 ],[ 'TLS-alert-received', _lowerFlatRecord({ fieldMetas: [['alertId', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatU8, 1, 1, 1],
        ],
        variantSize32: 2,
        variantAlign32: 1,
        variantPayloadOffset32: 1,
        variantFlatCount: 2,
      })
      , 2, 1 ],['alertMessage', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatStringAny, 8, 4, 2],
        ],
        variantSize32: 12,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 3,
      })
      , 12, 4 ],], size32: 16, align32: 4 }), 16, 4, 5 ],[ 'HTTP-request-denied', null, 0, 0, 0 ],[ 'HTTP-request-length-required', null, 0, 0, 0 ],[ 'HTTP-request-body-size', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatU64, 8, 8, 1],
        ],
        variantSize32: 16,
        variantAlign32: 8,
        variantPayloadOffset32: 8,
        variantFlatCount: 2,
      })
      , 16, 8, 2 ],[ 'HTTP-request-method-invalid', null, 0, 0, 0 ],[ 'HTTP-request-URI-invalid', null, 0, 0, 0 ],[ 'HTTP-request-URI-too-long', null, 0, 0, 0 ],[ 'HTTP-request-header-section-size', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatU32, 4, 4, 1],
        ],
        variantSize32: 8,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 2,
      })
      , 8, 4, 2 ],[ 'HTTP-request-header-size', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatRecord({ fieldMetas: [['fieldName', 
        _lowerFlatOption({
          caseMetas: [
          [ 'none', null, 0, 0, 0 ],
          [ 'some', _lowerFlatStringAny, 8, 4, 2],
          ],
          variantSize32: 12,
          variantAlign32: 4,
          variantPayloadOffset32: 4,
          variantFlatCount: 3,
        })
        , 12, 4 ],['fieldSize', 
        _lowerFlatOption({
          caseMetas: [
          [ 'none', null, 0, 0, 0 ],
          [ 'some', _lowerFlatU32, 4, 4, 1],
          ],
          variantSize32: 8,
          variantAlign32: 4,
          variantPayloadOffset32: 4,
          variantFlatCount: 2,
        })
        , 8, 4 ],], size32: 20, align32: 4 }), 20, 4, 5],
        ],
        variantSize32: 24,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 6,
      })
      , 24, 4, 6 ],[ 'HTTP-request-trailer-section-size', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatU32, 4, 4, 1],
        ],
        variantSize32: 8,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 2,
      })
      , 8, 4, 2 ],[ 'HTTP-request-trailer-size', _lowerFlatRecord({ fieldMetas: [['fieldName', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatStringAny, 8, 4, 2],
        ],
        variantSize32: 12,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 3,
      })
      , 12, 4 ],['fieldSize', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatU32, 4, 4, 1],
        ],
        variantSize32: 8,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 2,
      })
      , 8, 4 ],], size32: 20, align32: 4 }), 20, 4, 5 ],[ 'HTTP-response-incomplete', null, 0, 0, 0 ],[ 'HTTP-response-header-section-size', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatU32, 4, 4, 1],
        ],
        variantSize32: 8,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 2,
      })
      , 8, 4, 2 ],[ 'HTTP-response-header-size', _lowerFlatRecord({ fieldMetas: [['fieldName', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatStringAny, 8, 4, 2],
        ],
        variantSize32: 12,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 3,
      })
      , 12, 4 ],['fieldSize', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatU32, 4, 4, 1],
        ],
        variantSize32: 8,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 2,
      })
      , 8, 4 ],], size32: 20, align32: 4 }), 20, 4, 5 ],[ 'HTTP-response-body-size', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatU64, 8, 8, 1],
        ],
        variantSize32: 16,
        variantAlign32: 8,
        variantPayloadOffset32: 8,
        variantFlatCount: 2,
      })
      , 16, 8, 2 ],[ 'HTTP-response-trailer-section-size', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatU32, 4, 4, 1],
        ],
        variantSize32: 8,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 2,
      })
      , 8, 4, 2 ],[ 'HTTP-response-trailer-size', _lowerFlatRecord({ fieldMetas: [['fieldName', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatStringAny, 8, 4, 2],
        ],
        variantSize32: 12,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 3,
      })
      , 12, 4 ],['fieldSize', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatU32, 4, 4, 1],
        ],
        variantSize32: 8,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 2,
      })
      , 8, 4 ],], size32: 20, align32: 4 }), 20, 4, 5 ],[ 'HTTP-response-transfer-coding', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatStringAny, 8, 4, 2],
        ],
        variantSize32: 12,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 3,
      })
      , 12, 4, 3 ],[ 'HTTP-response-content-coding', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatStringAny, 8, 4, 2],
        ],
        variantSize32: 12,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 3,
      })
      , 12, 4, 3 ],[ 'HTTP-response-timeout', null, 0, 0, 0 ],[ 'HTTP-upgrade-failed', null, 0, 0, 0 ],[ 'HTTP-protocol-error', null, 0, 0, 0 ],[ 'loop-detected', null, 0, 0, 0 ],[ 'configuration-error', null, 0, 0, 0 ],[ 'internal-error', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatStringAny, 8, 4, 2],
        ],
        variantSize32: 12,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 3,
      })
      , 12, 4, 3 ],],
      variantSize32: 32,
      variantAlign32: 8,
      variantPayloadOffset32: 8,
      variantFlatCount: 7,
    } ), 40, 8, 8 ],
    ],
    variantSize32: 40,
    variantAlign32: 8,
    variantPayloadOffset32: 8,
    variantFlatCount: 8,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: () => realloc0,
  importFn: _trampoline63,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 63,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline63.manuallyAsync,
  paramLiftFns: [_liftFlatOwn({
    componentIdx: 0,
    className: OutgoingRequest,
    createResourceFn: 
    (handle) => {
      const rep = handleTable11[(handle << 1) + 1] & ~T_FLAG;
      let resourceObj = captureTable11.get(rep);
      if (!resourceObj) {
        resourceObj = Object.create(OutgoingRequest.prototype);
        Object.defineProperty(resourceObj, symbolRscHandle, { writable: true, value: handle });
        Object.defineProperty(resourceObj, symbolRscRep, { writable: true, value: rep });
      } else {
        captureTable11.delete(rep);
      }
      rscTableRemove(handleTable11, handle);
      return resourceObj;
    }
    ,
  })
  ,
  _liftFlatOption({
    caseMetas: [
    ['none', null, 0, 0, 0 ],
    ['some', _liftFlatOwn({
      componentIdx: 0,
      className: RequestOptions,
      createResourceFn: 
      (handle) => {
        const rep = handleTable17[(handle << 1) + 1] & ~T_FLAG;
        let resourceObj = captureTable17.get(rep);
        if (!resourceObj) {
          resourceObj = Object.create(RequestOptions.prototype);
          Object.defineProperty(resourceObj, symbolRscHandle, { writable: true, value: handle });
          Object.defineProperty(resourceObj, symbolRscRep, { writable: true, value: rep });
        } else {
          captureTable17.delete(rep);
        }
        rscTableRemove(handleTable17, handle);
        return resourceObj;
      }
      ,
    })
    , 4, 4, 1 ],
    ],
    variantSize32: 8,
    variantAlign32: 4,
    variantPayloadOffset32: 4,
    variantFlatCount: 2,
  })
  ],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', _lowerFlatOwn({
      componentIdx: 0,
      lowerFn: 
      function lowerImportedOwnedHost_FutureIncomingResponse(obj) {
        if (!(obj instanceof FutureIncomingResponse)) {
          throw new TypeError('Resource error: Not a valid \"FutureIncomingResponse\" resource.');
        }
        let handle = obj[symbolRscHandle];
        if (!handle) {
          const rep = obj[symbolRscRep] || ++captureCnt16;
          captureTable16.set(rep, obj);
          handle = rscTableCreateOwn(handleTable16, rep);
        }
        return handle;
      }
      ,
    }), 40, 8, 8 ],
    [ 'err', _lowerFlatVariant({
      caseMetas: [[ 'DNS-timeout', null, 0, 0, 0 ],[ 'DNS-error', _lowerFlatRecord({ fieldMetas: [['rcode', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatStringAny, 8, 4, 2],
        ],
        variantSize32: 12,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 3,
      })
      , 12, 4 ],['infoCode', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatU16, 2, 2, 1],
        ],
        variantSize32: 4,
        variantAlign32: 2,
        variantPayloadOffset32: 2,
        variantFlatCount: 2,
      })
      , 4, 2 ],], size32: 16, align32: 4 }), 16, 4, 5 ],[ 'destination-not-found', null, 0, 0, 0 ],[ 'destination-unavailable', null, 0, 0, 0 ],[ 'destination-IP-prohibited', null, 0, 0, 0 ],[ 'destination-IP-unroutable', null, 0, 0, 0 ],[ 'connection-refused', null, 0, 0, 0 ],[ 'connection-terminated', null, 0, 0, 0 ],[ 'connection-timeout', null, 0, 0, 0 ],[ 'connection-read-timeout', null, 0, 0, 0 ],[ 'connection-write-timeout', null, 0, 0, 0 ],[ 'connection-limit-reached', null, 0, 0, 0 ],[ 'TLS-protocol-error', null, 0, 0, 0 ],[ 'TLS-certificate-error', null, 0, 0, 0 ],[ 'TLS-alert-received', _lowerFlatRecord({ fieldMetas: [['alertId', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatU8, 1, 1, 1],
        ],
        variantSize32: 2,
        variantAlign32: 1,
        variantPayloadOffset32: 1,
        variantFlatCount: 2,
      })
      , 2, 1 ],['alertMessage', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatStringAny, 8, 4, 2],
        ],
        variantSize32: 12,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 3,
      })
      , 12, 4 ],], size32: 16, align32: 4 }), 16, 4, 5 ],[ 'HTTP-request-denied', null, 0, 0, 0 ],[ 'HTTP-request-length-required', null, 0, 0, 0 ],[ 'HTTP-request-body-size', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatU64, 8, 8, 1],
        ],
        variantSize32: 16,
        variantAlign32: 8,
        variantPayloadOffset32: 8,
        variantFlatCount: 2,
      })
      , 16, 8, 2 ],[ 'HTTP-request-method-invalid', null, 0, 0, 0 ],[ 'HTTP-request-URI-invalid', null, 0, 0, 0 ],[ 'HTTP-request-URI-too-long', null, 0, 0, 0 ],[ 'HTTP-request-header-section-size', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatU32, 4, 4, 1],
        ],
        variantSize32: 8,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 2,
      })
      , 8, 4, 2 ],[ 'HTTP-request-header-size', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatRecord({ fieldMetas: [['fieldName', 
        _lowerFlatOption({
          caseMetas: [
          [ 'none', null, 0, 0, 0 ],
          [ 'some', _lowerFlatStringAny, 8, 4, 2],
          ],
          variantSize32: 12,
          variantAlign32: 4,
          variantPayloadOffset32: 4,
          variantFlatCount: 3,
        })
        , 12, 4 ],['fieldSize', 
        _lowerFlatOption({
          caseMetas: [
          [ 'none', null, 0, 0, 0 ],
          [ 'some', _lowerFlatU32, 4, 4, 1],
          ],
          variantSize32: 8,
          variantAlign32: 4,
          variantPayloadOffset32: 4,
          variantFlatCount: 2,
        })
        , 8, 4 ],], size32: 20, align32: 4 }), 20, 4, 5],
        ],
        variantSize32: 24,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 6,
      })
      , 24, 4, 6 ],[ 'HTTP-request-trailer-section-size', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatU32, 4, 4, 1],
        ],
        variantSize32: 8,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 2,
      })
      , 8, 4, 2 ],[ 'HTTP-request-trailer-size', _lowerFlatRecord({ fieldMetas: [['fieldName', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatStringAny, 8, 4, 2],
        ],
        variantSize32: 12,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 3,
      })
      , 12, 4 ],['fieldSize', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatU32, 4, 4, 1],
        ],
        variantSize32: 8,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 2,
      })
      , 8, 4 ],], size32: 20, align32: 4 }), 20, 4, 5 ],[ 'HTTP-response-incomplete', null, 0, 0, 0 ],[ 'HTTP-response-header-section-size', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatU32, 4, 4, 1],
        ],
        variantSize32: 8,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 2,
      })
      , 8, 4, 2 ],[ 'HTTP-response-header-size', _lowerFlatRecord({ fieldMetas: [['fieldName', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatStringAny, 8, 4, 2],
        ],
        variantSize32: 12,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 3,
      })
      , 12, 4 ],['fieldSize', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatU32, 4, 4, 1],
        ],
        variantSize32: 8,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 2,
      })
      , 8, 4 ],], size32: 20, align32: 4 }), 20, 4, 5 ],[ 'HTTP-response-body-size', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatU64, 8, 8, 1],
        ],
        variantSize32: 16,
        variantAlign32: 8,
        variantPayloadOffset32: 8,
        variantFlatCount: 2,
      })
      , 16, 8, 2 ],[ 'HTTP-response-trailer-section-size', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatU32, 4, 4, 1],
        ],
        variantSize32: 8,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 2,
      })
      , 8, 4, 2 ],[ 'HTTP-response-trailer-size', _lowerFlatRecord({ fieldMetas: [['fieldName', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatStringAny, 8, 4, 2],
        ],
        variantSize32: 12,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 3,
      })
      , 12, 4 ],['fieldSize', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatU32, 4, 4, 1],
        ],
        variantSize32: 8,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 2,
      })
      , 8, 4 ],], size32: 20, align32: 4 }), 20, 4, 5 ],[ 'HTTP-response-transfer-coding', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatStringAny, 8, 4, 2],
        ],
        variantSize32: 12,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 3,
      })
      , 12, 4, 3 ],[ 'HTTP-response-content-coding', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatStringAny, 8, 4, 2],
        ],
        variantSize32: 12,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 3,
      })
      , 12, 4, 3 ],[ 'HTTP-response-timeout', null, 0, 0, 0 ],[ 'HTTP-upgrade-failed', null, 0, 0, 0 ],[ 'HTTP-protocol-error', null, 0, 0, 0 ],[ 'loop-detected', null, 0, 0, 0 ],[ 'configuration-error', null, 0, 0, 0 ],[ 'internal-error', 
      _lowerFlatOption({
        caseMetas: [
        [ 'none', null, 0, 0, 0 ],
        [ 'some', _lowerFlatStringAny, 8, 4, 2],
        ],
        variantSize32: 12,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 3,
      })
      , 12, 4, 3 ],],
      variantSize32: 32,
      variantAlign32: 8,
      variantPayloadOffset32: 8,
      variantFlatCount: 7,
    } ), 40, 8, 8 ],
    ],
    variantSize32: 40,
    variantAlign32: 8,
    variantPayloadOffset32: 8,
    variantFlatCount: 8,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: () => realloc0,
  importFn: _trampoline63,
},
);
let trampoline64 = _trampoline64.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 64,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline64.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 0),_liftFlatList({
    elemLiftFn: _liftFlatVariant({
      caseMetas: [['node-created', _liftFlatRecord({ fieldMetas: [['eventId', _liftFlatStringAny, 8, 4],['id', _liftFlatStringAny, 8, 4],['nodeType', _liftFlatStringAny, 8, 4],['properties', _liftFlatList({
        elemLiftFn: _liftFlatRecord({ fieldMetas: [['name', _liftFlatStringAny, 8, 4],['value', _liftFlatVariant({
          caseMetas: [['text', _liftFlatStringAny, 8, 4, 2],['integer', _liftFlatS64, 8, 8, 1],['decimal', _liftFlatFloat64, 8, 8, 1],['boolean', _liftFlatBool, 1, 1, 1],['date-time', _liftFlatStringAny, 8, 4, 2],['node-id', _liftFlatStringAny, 8, 4, 2],['list-of-text', _liftFlatList({
            elemLiftFn: _liftFlatStringAny,
            elemAlign32: 4,
            elemSize32: 8,
            typedArray: undefined,
          }), 8, 4, 2],['none', null, 0, 0, 0],],
          variantSize32: 16,
          variantAlign32: 8,
          variantPayloadOffset32: 8,
          variantFlatCount: 3,
        } ), 16, 8],], size32: 24, align32: 8 }),
        elemAlign32: 8,
        elemSize32: 24,
        typedArray: undefined,
      }), 8, 4],['timestamp', _liftFlatStringAny, 8, 4],['deviceId', _liftFlatStringAny, 8, 4],['batchId', 
      _liftFlatOption({
        caseMetas: [
        ['none', null, 0, 0, 0 ],
        ['some', _liftFlatStringAny, 8, 4, 2 ],
        ],
        variantSize32: 12,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 3,
      })
      , 12, 4],], size32: 60, align32: 4 }), 60, 4, 15],['node-properties-updated', _liftFlatRecord({ fieldMetas: [['eventId', _liftFlatStringAny, 8, 4],['id', _liftFlatStringAny, 8, 4],['changes', _liftFlatList({
        elemLiftFn: _liftFlatRecord({ fieldMetas: [['name', _liftFlatStringAny, 8, 4],['value', _liftFlatVariant({
          caseMetas: [['text', _liftFlatStringAny, 8, 4, 2],['integer', _liftFlatS64, 8, 8, 1],['decimal', _liftFlatFloat64, 8, 8, 1],['boolean', _liftFlatBool, 1, 1, 1],['date-time', _liftFlatStringAny, 8, 4, 2],['node-id', _liftFlatStringAny, 8, 4, 2],['list-of-text', _liftFlatList({
            elemLiftFn: _liftFlatStringAny,
            elemAlign32: 4,
            elemSize32: 8,
            typedArray: undefined,
          }), 8, 4, 2],['none', null, 0, 0, 0],],
          variantSize32: 16,
          variantAlign32: 8,
          variantPayloadOffset32: 8,
          variantFlatCount: 3,
        } ), 16, 8],], size32: 24, align32: 8 }),
        elemAlign32: 8,
        elemSize32: 24,
        typedArray: undefined,
      }), 8, 4],['timestamp', _liftFlatStringAny, 8, 4],['deviceId', _liftFlatStringAny, 8, 4],['batchId', 
      _liftFlatOption({
        caseMetas: [
        ['none', null, 0, 0, 0 ],
        ['some', _liftFlatStringAny, 8, 4, 2 ],
        ],
        variantSize32: 12,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 3,
      })
      , 12, 4],], size32: 52, align32: 4 }), 52, 4, 13],],
      variantSize32: 64,
      variantAlign32: 4,
      variantPayloadOffset32: 4,
      variantFlatCount: 16,
    } ),
    elemAlign32: 4,
    elemSize32: 64,
    typedArray: undefined,
  })],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', null, 2, 1, 1 ],
    [ 'err', 
    _lowerFlatEnum({
      caseMetas: [['parent-not-found', null, 1, 1, 1],['unauthorized', null, 1, 1, 1],['invalid-event-format', null, 1, 1, 1],['validation-failure', null, 1, 1, 1],['concurrent-modification', null, 1, 1, 1],['storage-error', null, 1, 1, 1],],
      variantSize32: 1,
      variantAlign32: 1,
      variantPayloadOffset32: 1,
      variantFlatCount: 1,
    })
    , 2, 1, 1 ],
    ],
    variantSize32: 2,
    variantAlign32: 1,
    variantPayloadOffset32: 1,
    variantFlatCount: 2,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline64,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 64,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline64.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 0),_liftFlatList({
    elemLiftFn: _liftFlatVariant({
      caseMetas: [['node-created', _liftFlatRecord({ fieldMetas: [['eventId', _liftFlatStringAny, 8, 4],['id', _liftFlatStringAny, 8, 4],['nodeType', _liftFlatStringAny, 8, 4],['properties', _liftFlatList({
        elemLiftFn: _liftFlatRecord({ fieldMetas: [['name', _liftFlatStringAny, 8, 4],['value', _liftFlatVariant({
          caseMetas: [['text', _liftFlatStringAny, 8, 4, 2],['integer', _liftFlatS64, 8, 8, 1],['decimal', _liftFlatFloat64, 8, 8, 1],['boolean', _liftFlatBool, 1, 1, 1],['date-time', _liftFlatStringAny, 8, 4, 2],['node-id', _liftFlatStringAny, 8, 4, 2],['list-of-text', _liftFlatList({
            elemLiftFn: _liftFlatStringAny,
            elemAlign32: 4,
            elemSize32: 8,
            typedArray: undefined,
          }), 8, 4, 2],['none', null, 0, 0, 0],],
          variantSize32: 16,
          variantAlign32: 8,
          variantPayloadOffset32: 8,
          variantFlatCount: 3,
        } ), 16, 8],], size32: 24, align32: 8 }),
        elemAlign32: 8,
        elemSize32: 24,
        typedArray: undefined,
      }), 8, 4],['timestamp', _liftFlatStringAny, 8, 4],['deviceId', _liftFlatStringAny, 8, 4],['batchId', 
      _liftFlatOption({
        caseMetas: [
        ['none', null, 0, 0, 0 ],
        ['some', _liftFlatStringAny, 8, 4, 2 ],
        ],
        variantSize32: 12,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 3,
      })
      , 12, 4],], size32: 60, align32: 4 }), 60, 4, 15],['node-properties-updated', _liftFlatRecord({ fieldMetas: [['eventId', _liftFlatStringAny, 8, 4],['id', _liftFlatStringAny, 8, 4],['changes', _liftFlatList({
        elemLiftFn: _liftFlatRecord({ fieldMetas: [['name', _liftFlatStringAny, 8, 4],['value', _liftFlatVariant({
          caseMetas: [['text', _liftFlatStringAny, 8, 4, 2],['integer', _liftFlatS64, 8, 8, 1],['decimal', _liftFlatFloat64, 8, 8, 1],['boolean', _liftFlatBool, 1, 1, 1],['date-time', _liftFlatStringAny, 8, 4, 2],['node-id', _liftFlatStringAny, 8, 4, 2],['list-of-text', _liftFlatList({
            elemLiftFn: _liftFlatStringAny,
            elemAlign32: 4,
            elemSize32: 8,
            typedArray: undefined,
          }), 8, 4, 2],['none', null, 0, 0, 0],],
          variantSize32: 16,
          variantAlign32: 8,
          variantPayloadOffset32: 8,
          variantFlatCount: 3,
        } ), 16, 8],], size32: 24, align32: 8 }),
        elemAlign32: 8,
        elemSize32: 24,
        typedArray: undefined,
      }), 8, 4],['timestamp', _liftFlatStringAny, 8, 4],['deviceId', _liftFlatStringAny, 8, 4],['batchId', 
      _liftFlatOption({
        caseMetas: [
        ['none', null, 0, 0, 0 ],
        ['some', _liftFlatStringAny, 8, 4, 2 ],
        ],
        variantSize32: 12,
        variantAlign32: 4,
        variantPayloadOffset32: 4,
        variantFlatCount: 3,
      })
      , 12, 4],], size32: 52, align32: 4 }), 52, 4, 13],],
      variantSize32: 64,
      variantAlign32: 4,
      variantPayloadOffset32: 4,
      variantFlatCount: 16,
    } ),
    elemAlign32: 4,
    elemSize32: 64,
    typedArray: undefined,
  })],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', null, 2, 1, 1 ],
    [ 'err', 
    _lowerFlatEnum({
      caseMetas: [['parent-not-found', null, 1, 1, 1],['unauthorized', null, 1, 1, 1],['invalid-event-format', null, 1, 1, 1],['validation-failure', null, 1, 1, 1],['concurrent-modification', null, 1, 1, 1],['storage-error', null, 1, 1, 1],],
      variantSize32: 1,
      variantAlign32: 1,
      variantPayloadOffset32: 1,
      variantFlatCount: 1,
    })
    , 2, 1, 1 ],
    ],
    variantSize32: 2,
    variantAlign32: 1,
    variantPayloadOffset32: 1,
    variantFlatCount: 2,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline64,
},
);
let trampoline65 = _trampoline65.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 65,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline65.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 0)],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', _lowerFlatStringAny, 12, 4, 4 ],
    [ 'err', 
    _lowerFlatEnum({
      caseMetas: [['parent-not-found', null, 1, 1, 1],['unauthorized', null, 1, 1, 1],['invalid-event-format', null, 1, 1, 1],['validation-failure', null, 1, 1, 1],['concurrent-modification', null, 1, 1, 1],['storage-error', null, 1, 1, 1],],
      variantSize32: 1,
      variantAlign32: 1,
      variantPayloadOffset32: 1,
      variantFlatCount: 1,
    })
    , 12, 4, 4 ],
    ],
    variantSize32: 12,
    variantAlign32: 4,
    variantPayloadOffset32: 4,
    variantFlatCount: 3,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: () => realloc0,
  importFn: _trampoline65,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 65,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline65.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 0)],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', _lowerFlatStringAny, 12, 4, 4 ],
    [ 'err', 
    _lowerFlatEnum({
      caseMetas: [['parent-not-found', null, 1, 1, 1],['unauthorized', null, 1, 1, 1],['invalid-event-format', null, 1, 1, 1],['validation-failure', null, 1, 1, 1],['concurrent-modification', null, 1, 1, 1],['storage-error', null, 1, 1, 1],],
      variantSize32: 1,
      variantAlign32: 1,
      variantPayloadOffset32: 1,
      variantFlatCount: 1,
    })
    , 12, 4, 4 ],
    ],
    variantSize32: 12,
    variantAlign32: 4,
    variantPayloadOffset32: 4,
    variantFlatCount: 3,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: () => realloc0,
  importFn: _trampoline65,
},
);
let trampoline66 = _trampoline66.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 66,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline66.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 0),_liftFlatStringAny],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', _lowerFlatRecord({ fieldMetas: [['id', _lowerFlatStringAny, 8, 4 ],['nodeType', _lowerFlatStringAny, 8, 4 ],['properties', _lowerFlatList({
      elemLowerFn: _lowerFlatRecord({ fieldMetas: [['name', _lowerFlatStringAny, 8, 4 ],['value', _lowerFlatVariant({
        caseMetas: [[ 'text', _lowerFlatStringAny, 8, 4, 2 ],[ 'integer', _lowerFlatS64, 8, 8, 1 ],[ 'decimal', _lowerFlatFloat64, 8, 8, 1 ],[ 'boolean', _lowerFlatBool, 1, 1, 1 ],[ 'date-time', _lowerFlatStringAny, 8, 4, 2 ],[ 'node-id', _lowerFlatStringAny, 8, 4, 2 ],[ 'list-of-text', _lowerFlatList({
          elemLowerFn: _lowerFlatStringAny,
          elemSize32: 8,
          elemAlign32: 4,
        }), 8, 4, 2 ],[ 'none', null, 0, 0, 0 ],],
        variantSize32: 16,
        variantAlign32: 8,
        variantPayloadOffset32: 8,
        variantFlatCount: 3,
      } ), 16, 8 ],], size32: 24, align32: 8 }),
      elemSize32: 24,
      elemAlign32: 8,
    }), 8, 4 ],], size32: 24, align32: 4 }), 28, 4, 4 ],
    [ 'err', 
    _lowerFlatEnum({
      caseMetas: [['invalid-query', null, 1, 1, 1],['node-not-found', null, 1, 1, 1],['access-denied', null, 1, 1, 1],],
      variantSize32: 1,
      variantAlign32: 1,
      variantPayloadOffset32: 1,
      variantFlatCount: 1,
    })
    , 28, 4, 4 ],
    ],
    variantSize32: 28,
    variantAlign32: 4,
    variantPayloadOffset32: 4,
    variantFlatCount: 7,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: () => realloc0,
  importFn: _trampoline66,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 66,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline66.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 0),_liftFlatStringAny],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', _lowerFlatRecord({ fieldMetas: [['id', _lowerFlatStringAny, 8, 4 ],['nodeType', _lowerFlatStringAny, 8, 4 ],['properties', _lowerFlatList({
      elemLowerFn: _lowerFlatRecord({ fieldMetas: [['name', _lowerFlatStringAny, 8, 4 ],['value', _lowerFlatVariant({
        caseMetas: [[ 'text', _lowerFlatStringAny, 8, 4, 2 ],[ 'integer', _lowerFlatS64, 8, 8, 1 ],[ 'decimal', _lowerFlatFloat64, 8, 8, 1 ],[ 'boolean', _lowerFlatBool, 1, 1, 1 ],[ 'date-time', _lowerFlatStringAny, 8, 4, 2 ],[ 'node-id', _lowerFlatStringAny, 8, 4, 2 ],[ 'list-of-text', _lowerFlatList({
          elemLowerFn: _lowerFlatStringAny,
          elemSize32: 8,
          elemAlign32: 4,
        }), 8, 4, 2 ],[ 'none', null, 0, 0, 0 ],],
        variantSize32: 16,
        variantAlign32: 8,
        variantPayloadOffset32: 8,
        variantFlatCount: 3,
      } ), 16, 8 ],], size32: 24, align32: 8 }),
      elemSize32: 24,
      elemAlign32: 8,
    }), 8, 4 ],], size32: 24, align32: 4 }), 28, 4, 4 ],
    [ 'err', 
    _lowerFlatEnum({
      caseMetas: [['invalid-query', null, 1, 1, 1],['node-not-found', null, 1, 1, 1],['access-denied', null, 1, 1, 1],],
      variantSize32: 1,
      variantAlign32: 1,
      variantPayloadOffset32: 1,
      variantFlatCount: 1,
    })
    , 28, 4, 4 ],
    ],
    variantSize32: 28,
    variantAlign32: 4,
    variantPayloadOffset32: 4,
    variantFlatCount: 7,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: () => realloc0,
  importFn: _trampoline66,
},
);
let trampoline67 = _trampoline67.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 67,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline67.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 0),_liftFlatStringAny],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', _lowerFlatList({
      elemLowerFn: _lowerFlatRecord({ fieldMetas: [['id', _lowerFlatStringAny, 8, 4 ],['nodeType', _lowerFlatStringAny, 8, 4 ],['properties', _lowerFlatList({
        elemLowerFn: _lowerFlatRecord({ fieldMetas: [['name', _lowerFlatStringAny, 8, 4 ],['value', _lowerFlatVariant({
          caseMetas: [[ 'text', _lowerFlatStringAny, 8, 4, 2 ],[ 'integer', _lowerFlatS64, 8, 8, 1 ],[ 'decimal', _lowerFlatFloat64, 8, 8, 1 ],[ 'boolean', _lowerFlatBool, 1, 1, 1 ],[ 'date-time', _lowerFlatStringAny, 8, 4, 2 ],[ 'node-id', _lowerFlatStringAny, 8, 4, 2 ],[ 'list-of-text', _lowerFlatList({
            elemLowerFn: _lowerFlatStringAny,
            elemSize32: 8,
            elemAlign32: 4,
          }), 8, 4, 2 ],[ 'none', null, 0, 0, 0 ],],
          variantSize32: 16,
          variantAlign32: 8,
          variantPayloadOffset32: 8,
          variantFlatCount: 3,
        } ), 16, 8 ],], size32: 24, align32: 8 }),
        elemSize32: 24,
        elemAlign32: 8,
      }), 8, 4 ],], size32: 24, align32: 4 }),
      elemSize32: 24,
      elemAlign32: 4,
    }), 12, 4, 4 ],
    [ 'err', 
    _lowerFlatEnum({
      caseMetas: [['invalid-query', null, 1, 1, 1],['node-not-found', null, 1, 1, 1],['access-denied', null, 1, 1, 1],],
      variantSize32: 1,
      variantAlign32: 1,
      variantPayloadOffset32: 1,
      variantFlatCount: 1,
    })
    , 12, 4, 4 ],
    ],
    variantSize32: 12,
    variantAlign32: 4,
    variantPayloadOffset32: 4,
    variantFlatCount: 3,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: () => realloc0,
  importFn: _trampoline67,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 67,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline67.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 0),_liftFlatStringAny],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', _lowerFlatList({
      elemLowerFn: _lowerFlatRecord({ fieldMetas: [['id', _lowerFlatStringAny, 8, 4 ],['nodeType', _lowerFlatStringAny, 8, 4 ],['properties', _lowerFlatList({
        elemLowerFn: _lowerFlatRecord({ fieldMetas: [['name', _lowerFlatStringAny, 8, 4 ],['value', _lowerFlatVariant({
          caseMetas: [[ 'text', _lowerFlatStringAny, 8, 4, 2 ],[ 'integer', _lowerFlatS64, 8, 8, 1 ],[ 'decimal', _lowerFlatFloat64, 8, 8, 1 ],[ 'boolean', _lowerFlatBool, 1, 1, 1 ],[ 'date-time', _lowerFlatStringAny, 8, 4, 2 ],[ 'node-id', _lowerFlatStringAny, 8, 4, 2 ],[ 'list-of-text', _lowerFlatList({
            elemLowerFn: _lowerFlatStringAny,
            elemSize32: 8,
            elemAlign32: 4,
          }), 8, 4, 2 ],[ 'none', null, 0, 0, 0 ],],
          variantSize32: 16,
          variantAlign32: 8,
          variantPayloadOffset32: 8,
          variantFlatCount: 3,
        } ), 16, 8 ],], size32: 24, align32: 8 }),
        elemSize32: 24,
        elemAlign32: 8,
      }), 8, 4 ],], size32: 24, align32: 4 }),
      elemSize32: 24,
      elemAlign32: 4,
    }), 12, 4, 4 ],
    [ 'err', 
    _lowerFlatEnum({
      caseMetas: [['invalid-query', null, 1, 1, 1],['node-not-found', null, 1, 1, 1],['access-denied', null, 1, 1, 1],],
      variantSize32: 1,
      variantAlign32: 1,
      variantPayloadOffset32: 1,
      variantFlatCount: 1,
    })
    , 12, 4, 4 ],
    ],
    variantSize32: 12,
    variantAlign32: 4,
    variantPayloadOffset32: 4,
    variantFlatCount: 3,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: () => realloc0,
  importFn: _trampoline67,
},
);
let trampoline68 = _trampoline68.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 68,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline68.manuallyAsync,
  paramLiftFns: [],
  resultLowerFns: [_lowerFlatRecord({ fieldMetas: [['seconds', _lowerFlatU64, 8, 8 ],['nanoseconds', _lowerFlatU32, 4, 4 ],], size32: 16, align32: 8 })],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline68,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 68,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline68.manuallyAsync,
  paramLiftFns: [],
  resultLowerFns: [_lowerFlatRecord({ fieldMetas: [['seconds', _lowerFlatU64, 8, 8 ],['nanoseconds', _lowerFlatU32, 4, 4 ],], size32: 16, align32: 8 })],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline68,
},
);
let trampoline69 = _trampoline69.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 69,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline69.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 7)],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', _lowerFlatFlags({ names: ['read','write','fileIntegritySync','dataIntegritySync','requestedWriteSync','mutateDirectory'], size32: 1, align32: 1, intSizeBytes: 1 }), 2, 1, 1 ],
    [ 'err', 
    _lowerFlatEnum({
      caseMetas: [['access', null, 1, 1, 1],['would-block', null, 1, 1, 1],['already', null, 1, 1, 1],['bad-descriptor', null, 1, 1, 1],['busy', null, 1, 1, 1],['deadlock', null, 1, 1, 1],['quota', null, 1, 1, 1],['exist', null, 1, 1, 1],['file-too-large', null, 1, 1, 1],['illegal-byte-sequence', null, 1, 1, 1],['in-progress', null, 1, 1, 1],['interrupted', null, 1, 1, 1],['invalid', null, 1, 1, 1],['io', null, 1, 1, 1],['is-directory', null, 1, 1, 1],['loop', null, 1, 1, 1],['too-many-links', null, 1, 1, 1],['message-size', null, 1, 1, 1],['name-too-long', null, 1, 1, 1],['no-device', null, 1, 1, 1],['no-entry', null, 1, 1, 1],['no-lock', null, 1, 1, 1],['insufficient-memory', null, 1, 1, 1],['insufficient-space', null, 1, 1, 1],['not-directory', null, 1, 1, 1],['not-empty', null, 1, 1, 1],['not-recoverable', null, 1, 1, 1],['unsupported', null, 1, 1, 1],['no-tty', null, 1, 1, 1],['no-such-device', null, 1, 1, 1],['overflow', null, 1, 1, 1],['not-permitted', null, 1, 1, 1],['pipe', null, 1, 1, 1],['read-only', null, 1, 1, 1],['invalid-seek', null, 1, 1, 1],['text-file-busy', null, 1, 1, 1],['cross-device', null, 1, 1, 1],],
      variantSize32: 1,
      variantAlign32: 1,
      variantPayloadOffset32: 1,
      variantFlatCount: 1,
    })
    , 2, 1, 1 ],
    ],
    variantSize32: 2,
    variantAlign32: 1,
    variantPayloadOffset32: 1,
    variantFlatCount: 2,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline69,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 69,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline69.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 7)],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', _lowerFlatFlags({ names: ['read','write','fileIntegritySync','dataIntegritySync','requestedWriteSync','mutateDirectory'], size32: 1, align32: 1, intSizeBytes: 1 }), 2, 1, 1 ],
    [ 'err', 
    _lowerFlatEnum({
      caseMetas: [['access', null, 1, 1, 1],['would-block', null, 1, 1, 1],['already', null, 1, 1, 1],['bad-descriptor', null, 1, 1, 1],['busy', null, 1, 1, 1],['deadlock', null, 1, 1, 1],['quota', null, 1, 1, 1],['exist', null, 1, 1, 1],['file-too-large', null, 1, 1, 1],['illegal-byte-sequence', null, 1, 1, 1],['in-progress', null, 1, 1, 1],['interrupted', null, 1, 1, 1],['invalid', null, 1, 1, 1],['io', null, 1, 1, 1],['is-directory', null, 1, 1, 1],['loop', null, 1, 1, 1],['too-many-links', null, 1, 1, 1],['message-size', null, 1, 1, 1],['name-too-long', null, 1, 1, 1],['no-device', null, 1, 1, 1],['no-entry', null, 1, 1, 1],['no-lock', null, 1, 1, 1],['insufficient-memory', null, 1, 1, 1],['insufficient-space', null, 1, 1, 1],['not-directory', null, 1, 1, 1],['not-empty', null, 1, 1, 1],['not-recoverable', null, 1, 1, 1],['unsupported', null, 1, 1, 1],['no-tty', null, 1, 1, 1],['no-such-device', null, 1, 1, 1],['overflow', null, 1, 1, 1],['not-permitted', null, 1, 1, 1],['pipe', null, 1, 1, 1],['read-only', null, 1, 1, 1],['invalid-seek', null, 1, 1, 1],['text-file-busy', null, 1, 1, 1],['cross-device', null, 1, 1, 1],],
      variantSize32: 1,
      variantAlign32: 1,
      variantPayloadOffset32: 1,
      variantFlatCount: 1,
    })
    , 2, 1, 1 ],
    ],
    variantSize32: 2,
    variantAlign32: 1,
    variantPayloadOffset32: 1,
    variantFlatCount: 2,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline69,
},
);
let trampoline70 = _trampoline70.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 70,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline70.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 7)],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', 
    _lowerFlatEnum({
      caseMetas: [['unknown', null, 1, 1, 1],['block-device', null, 1, 1, 1],['character-device', null, 1, 1, 1],['directory', null, 1, 1, 1],['fifo', null, 1, 1, 1],['symbolic-link', null, 1, 1, 1],['regular-file', null, 1, 1, 1],['socket', null, 1, 1, 1],],
      variantSize32: 1,
      variantAlign32: 1,
      variantPayloadOffset32: 1,
      variantFlatCount: 1,
    })
    , 2, 1, 1 ],
    [ 'err', 
    _lowerFlatEnum({
      caseMetas: [['access', null, 1, 1, 1],['would-block', null, 1, 1, 1],['already', null, 1, 1, 1],['bad-descriptor', null, 1, 1, 1],['busy', null, 1, 1, 1],['deadlock', null, 1, 1, 1],['quota', null, 1, 1, 1],['exist', null, 1, 1, 1],['file-too-large', null, 1, 1, 1],['illegal-byte-sequence', null, 1, 1, 1],['in-progress', null, 1, 1, 1],['interrupted', null, 1, 1, 1],['invalid', null, 1, 1, 1],['io', null, 1, 1, 1],['is-directory', null, 1, 1, 1],['loop', null, 1, 1, 1],['too-many-links', null, 1, 1, 1],['message-size', null, 1, 1, 1],['name-too-long', null, 1, 1, 1],['no-device', null, 1, 1, 1],['no-entry', null, 1, 1, 1],['no-lock', null, 1, 1, 1],['insufficient-memory', null, 1, 1, 1],['insufficient-space', null, 1, 1, 1],['not-directory', null, 1, 1, 1],['not-empty', null, 1, 1, 1],['not-recoverable', null, 1, 1, 1],['unsupported', null, 1, 1, 1],['no-tty', null, 1, 1, 1],['no-such-device', null, 1, 1, 1],['overflow', null, 1, 1, 1],['not-permitted', null, 1, 1, 1],['pipe', null, 1, 1, 1],['read-only', null, 1, 1, 1],['invalid-seek', null, 1, 1, 1],['text-file-busy', null, 1, 1, 1],['cross-device', null, 1, 1, 1],],
      variantSize32: 1,
      variantAlign32: 1,
      variantPayloadOffset32: 1,
      variantFlatCount: 1,
    })
    , 2, 1, 1 ],
    ],
    variantSize32: 2,
    variantAlign32: 1,
    variantPayloadOffset32: 1,
    variantFlatCount: 2,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline70,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 70,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline70.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 7)],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', 
    _lowerFlatEnum({
      caseMetas: [['unknown', null, 1, 1, 1],['block-device', null, 1, 1, 1],['character-device', null, 1, 1, 1],['directory', null, 1, 1, 1],['fifo', null, 1, 1, 1],['symbolic-link', null, 1, 1, 1],['regular-file', null, 1, 1, 1],['socket', null, 1, 1, 1],],
      variantSize32: 1,
      variantAlign32: 1,
      variantPayloadOffset32: 1,
      variantFlatCount: 1,
    })
    , 2, 1, 1 ],
    [ 'err', 
    _lowerFlatEnum({
      caseMetas: [['access', null, 1, 1, 1],['would-block', null, 1, 1, 1],['already', null, 1, 1, 1],['bad-descriptor', null, 1, 1, 1],['busy', null, 1, 1, 1],['deadlock', null, 1, 1, 1],['quota', null, 1, 1, 1],['exist', null, 1, 1, 1],['file-too-large', null, 1, 1, 1],['illegal-byte-sequence', null, 1, 1, 1],['in-progress', null, 1, 1, 1],['interrupted', null, 1, 1, 1],['invalid', null, 1, 1, 1],['io', null, 1, 1, 1],['is-directory', null, 1, 1, 1],['loop', null, 1, 1, 1],['too-many-links', null, 1, 1, 1],['message-size', null, 1, 1, 1],['name-too-long', null, 1, 1, 1],['no-device', null, 1, 1, 1],['no-entry', null, 1, 1, 1],['no-lock', null, 1, 1, 1],['insufficient-memory', null, 1, 1, 1],['insufficient-space', null, 1, 1, 1],['not-directory', null, 1, 1, 1],['not-empty', null, 1, 1, 1],['not-recoverable', null, 1, 1, 1],['unsupported', null, 1, 1, 1],['no-tty', null, 1, 1, 1],['no-such-device', null, 1, 1, 1],['overflow', null, 1, 1, 1],['not-permitted', null, 1, 1, 1],['pipe', null, 1, 1, 1],['read-only', null, 1, 1, 1],['invalid-seek', null, 1, 1, 1],['text-file-busy', null, 1, 1, 1],['cross-device', null, 1, 1, 1],],
      variantSize32: 1,
      variantAlign32: 1,
      variantPayloadOffset32: 1,
      variantFlatCount: 1,
    })
    , 2, 1, 1 ],
    ],
    variantSize32: 2,
    variantAlign32: 1,
    variantPayloadOffset32: 1,
    variantFlatCount: 2,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline70,
},
);
let trampoline71 = _trampoline71.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 71,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline71.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 1)],
  resultLowerFns: [
  _lowerFlatOption({
    caseMetas: [
    [ 'none', null, 0, 0, 0 ],
    [ 'some', 
    _lowerFlatEnum({
      caseMetas: [['access', null, 1, 1, 1],['would-block', null, 1, 1, 1],['already', null, 1, 1, 1],['bad-descriptor', null, 1, 1, 1],['busy', null, 1, 1, 1],['deadlock', null, 1, 1, 1],['quota', null, 1, 1, 1],['exist', null, 1, 1, 1],['file-too-large', null, 1, 1, 1],['illegal-byte-sequence', null, 1, 1, 1],['in-progress', null, 1, 1, 1],['interrupted', null, 1, 1, 1],['invalid', null, 1, 1, 1],['io', null, 1, 1, 1],['is-directory', null, 1, 1, 1],['loop', null, 1, 1, 1],['too-many-links', null, 1, 1, 1],['message-size', null, 1, 1, 1],['name-too-long', null, 1, 1, 1],['no-device', null, 1, 1, 1],['no-entry', null, 1, 1, 1],['no-lock', null, 1, 1, 1],['insufficient-memory', null, 1, 1, 1],['insufficient-space', null, 1, 1, 1],['not-directory', null, 1, 1, 1],['not-empty', null, 1, 1, 1],['not-recoverable', null, 1, 1, 1],['unsupported', null, 1, 1, 1],['no-tty', null, 1, 1, 1],['no-such-device', null, 1, 1, 1],['overflow', null, 1, 1, 1],['not-permitted', null, 1, 1, 1],['pipe', null, 1, 1, 1],['read-only', null, 1, 1, 1],['invalid-seek', null, 1, 1, 1],['text-file-busy', null, 1, 1, 1],['cross-device', null, 1, 1, 1],],
      variantSize32: 1,
      variantAlign32: 1,
      variantPayloadOffset32: 1,
      variantFlatCount: 1,
    })
    , 1, 1, 1],
    ],
    variantSize32: 2,
    variantAlign32: 1,
    variantPayloadOffset32: 1,
    variantFlatCount: 2,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline71,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 71,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline71.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 1)],
  resultLowerFns: [
  _lowerFlatOption({
    caseMetas: [
    [ 'none', null, 0, 0, 0 ],
    [ 'some', 
    _lowerFlatEnum({
      caseMetas: [['access', null, 1, 1, 1],['would-block', null, 1, 1, 1],['already', null, 1, 1, 1],['bad-descriptor', null, 1, 1, 1],['busy', null, 1, 1, 1],['deadlock', null, 1, 1, 1],['quota', null, 1, 1, 1],['exist', null, 1, 1, 1],['file-too-large', null, 1, 1, 1],['illegal-byte-sequence', null, 1, 1, 1],['in-progress', null, 1, 1, 1],['interrupted', null, 1, 1, 1],['invalid', null, 1, 1, 1],['io', null, 1, 1, 1],['is-directory', null, 1, 1, 1],['loop', null, 1, 1, 1],['too-many-links', null, 1, 1, 1],['message-size', null, 1, 1, 1],['name-too-long', null, 1, 1, 1],['no-device', null, 1, 1, 1],['no-entry', null, 1, 1, 1],['no-lock', null, 1, 1, 1],['insufficient-memory', null, 1, 1, 1],['insufficient-space', null, 1, 1, 1],['not-directory', null, 1, 1, 1],['not-empty', null, 1, 1, 1],['not-recoverable', null, 1, 1, 1],['unsupported', null, 1, 1, 1],['no-tty', null, 1, 1, 1],['no-such-device', null, 1, 1, 1],['overflow', null, 1, 1, 1],['not-permitted', null, 1, 1, 1],['pipe', null, 1, 1, 1],['read-only', null, 1, 1, 1],['invalid-seek', null, 1, 1, 1],['text-file-busy', null, 1, 1, 1],['cross-device', null, 1, 1, 1],],
      variantSize32: 1,
      variantAlign32: 1,
      variantPayloadOffset32: 1,
      variantFlatCount: 1,
    })
    , 1, 1, 1],
    ],
    variantSize32: 2,
    variantAlign32: 1,
    variantPayloadOffset32: 1,
    variantFlatCount: 2,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline71,
},
);
let trampoline72 = _trampoline72.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 72,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline72.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 7),_liftFlatU64],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', _lowerFlatOwn({
      componentIdx: 0,
      lowerFn: 
      function lowerImportedOwnedHost_OutputStream(obj) {
        if (!(obj instanceof OutputStream)) {
          throw new TypeError('Resource error: Not a valid \"OutputStream\" resource.');
        }
        let handle = obj[symbolRscHandle];
        if (!handle) {
          const rep = obj[symbolRscRep] || ++captureCnt4;
          captureTable4.set(rep, obj);
          handle = rscTableCreateOwn(handleTable4, rep);
        }
        return handle;
      }
      ,
    }), 8, 4, 4 ],
    [ 'err', 
    _lowerFlatEnum({
      caseMetas: [['access', null, 1, 1, 1],['would-block', null, 1, 1, 1],['already', null, 1, 1, 1],['bad-descriptor', null, 1, 1, 1],['busy', null, 1, 1, 1],['deadlock', null, 1, 1, 1],['quota', null, 1, 1, 1],['exist', null, 1, 1, 1],['file-too-large', null, 1, 1, 1],['illegal-byte-sequence', null, 1, 1, 1],['in-progress', null, 1, 1, 1],['interrupted', null, 1, 1, 1],['invalid', null, 1, 1, 1],['io', null, 1, 1, 1],['is-directory', null, 1, 1, 1],['loop', null, 1, 1, 1],['too-many-links', null, 1, 1, 1],['message-size', null, 1, 1, 1],['name-too-long', null, 1, 1, 1],['no-device', null, 1, 1, 1],['no-entry', null, 1, 1, 1],['no-lock', null, 1, 1, 1],['insufficient-memory', null, 1, 1, 1],['insufficient-space', null, 1, 1, 1],['not-directory', null, 1, 1, 1],['not-empty', null, 1, 1, 1],['not-recoverable', null, 1, 1, 1],['unsupported', null, 1, 1, 1],['no-tty', null, 1, 1, 1],['no-such-device', null, 1, 1, 1],['overflow', null, 1, 1, 1],['not-permitted', null, 1, 1, 1],['pipe', null, 1, 1, 1],['read-only', null, 1, 1, 1],['invalid-seek', null, 1, 1, 1],['text-file-busy', null, 1, 1, 1],['cross-device', null, 1, 1, 1],],
      variantSize32: 1,
      variantAlign32: 1,
      variantPayloadOffset32: 1,
      variantFlatCount: 1,
    })
    , 8, 4, 4 ],
    ],
    variantSize32: 8,
    variantAlign32: 4,
    variantPayloadOffset32: 4,
    variantFlatCount: 2,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline72,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 72,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline72.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 7),_liftFlatU64],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', _lowerFlatOwn({
      componentIdx: 0,
      lowerFn: 
      function lowerImportedOwnedHost_OutputStream(obj) {
        if (!(obj instanceof OutputStream)) {
          throw new TypeError('Resource error: Not a valid \"OutputStream\" resource.');
        }
        let handle = obj[symbolRscHandle];
        if (!handle) {
          const rep = obj[symbolRscRep] || ++captureCnt4;
          captureTable4.set(rep, obj);
          handle = rscTableCreateOwn(handleTable4, rep);
        }
        return handle;
      }
      ,
    }), 8, 4, 4 ],
    [ 'err', 
    _lowerFlatEnum({
      caseMetas: [['access', null, 1, 1, 1],['would-block', null, 1, 1, 1],['already', null, 1, 1, 1],['bad-descriptor', null, 1, 1, 1],['busy', null, 1, 1, 1],['deadlock', null, 1, 1, 1],['quota', null, 1, 1, 1],['exist', null, 1, 1, 1],['file-too-large', null, 1, 1, 1],['illegal-byte-sequence', null, 1, 1, 1],['in-progress', null, 1, 1, 1],['interrupted', null, 1, 1, 1],['invalid', null, 1, 1, 1],['io', null, 1, 1, 1],['is-directory', null, 1, 1, 1],['loop', null, 1, 1, 1],['too-many-links', null, 1, 1, 1],['message-size', null, 1, 1, 1],['name-too-long', null, 1, 1, 1],['no-device', null, 1, 1, 1],['no-entry', null, 1, 1, 1],['no-lock', null, 1, 1, 1],['insufficient-memory', null, 1, 1, 1],['insufficient-space', null, 1, 1, 1],['not-directory', null, 1, 1, 1],['not-empty', null, 1, 1, 1],['not-recoverable', null, 1, 1, 1],['unsupported', null, 1, 1, 1],['no-tty', null, 1, 1, 1],['no-such-device', null, 1, 1, 1],['overflow', null, 1, 1, 1],['not-permitted', null, 1, 1, 1],['pipe', null, 1, 1, 1],['read-only', null, 1, 1, 1],['invalid-seek', null, 1, 1, 1],['text-file-busy', null, 1, 1, 1],['cross-device', null, 1, 1, 1],],
      variantSize32: 1,
      variantAlign32: 1,
      variantPayloadOffset32: 1,
      variantFlatCount: 1,
    })
    , 8, 4, 4 ],
    ],
    variantSize32: 8,
    variantAlign32: 4,
    variantPayloadOffset32: 4,
    variantFlatCount: 2,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline72,
},
);
let trampoline73 = _trampoline73.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 73,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline73.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 7)],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', _lowerFlatOwn({
      componentIdx: 0,
      lowerFn: 
      function lowerImportedOwnedHost_OutputStream(obj) {
        if (!(obj instanceof OutputStream)) {
          throw new TypeError('Resource error: Not a valid \"OutputStream\" resource.');
        }
        let handle = obj[symbolRscHandle];
        if (!handle) {
          const rep = obj[symbolRscRep] || ++captureCnt4;
          captureTable4.set(rep, obj);
          handle = rscTableCreateOwn(handleTable4, rep);
        }
        return handle;
      }
      ,
    }), 8, 4, 4 ],
    [ 'err', 
    _lowerFlatEnum({
      caseMetas: [['access', null, 1, 1, 1],['would-block', null, 1, 1, 1],['already', null, 1, 1, 1],['bad-descriptor', null, 1, 1, 1],['busy', null, 1, 1, 1],['deadlock', null, 1, 1, 1],['quota', null, 1, 1, 1],['exist', null, 1, 1, 1],['file-too-large', null, 1, 1, 1],['illegal-byte-sequence', null, 1, 1, 1],['in-progress', null, 1, 1, 1],['interrupted', null, 1, 1, 1],['invalid', null, 1, 1, 1],['io', null, 1, 1, 1],['is-directory', null, 1, 1, 1],['loop', null, 1, 1, 1],['too-many-links', null, 1, 1, 1],['message-size', null, 1, 1, 1],['name-too-long', null, 1, 1, 1],['no-device', null, 1, 1, 1],['no-entry', null, 1, 1, 1],['no-lock', null, 1, 1, 1],['insufficient-memory', null, 1, 1, 1],['insufficient-space', null, 1, 1, 1],['not-directory', null, 1, 1, 1],['not-empty', null, 1, 1, 1],['not-recoverable', null, 1, 1, 1],['unsupported', null, 1, 1, 1],['no-tty', null, 1, 1, 1],['no-such-device', null, 1, 1, 1],['overflow', null, 1, 1, 1],['not-permitted', null, 1, 1, 1],['pipe', null, 1, 1, 1],['read-only', null, 1, 1, 1],['invalid-seek', null, 1, 1, 1],['text-file-busy', null, 1, 1, 1],['cross-device', null, 1, 1, 1],],
      variantSize32: 1,
      variantAlign32: 1,
      variantPayloadOffset32: 1,
      variantFlatCount: 1,
    })
    , 8, 4, 4 ],
    ],
    variantSize32: 8,
    variantAlign32: 4,
    variantPayloadOffset32: 4,
    variantFlatCount: 2,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline73,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 73,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline73.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 7)],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', _lowerFlatOwn({
      componentIdx: 0,
      lowerFn: 
      function lowerImportedOwnedHost_OutputStream(obj) {
        if (!(obj instanceof OutputStream)) {
          throw new TypeError('Resource error: Not a valid \"OutputStream\" resource.');
        }
        let handle = obj[symbolRscHandle];
        if (!handle) {
          const rep = obj[symbolRscRep] || ++captureCnt4;
          captureTable4.set(rep, obj);
          handle = rscTableCreateOwn(handleTable4, rep);
        }
        return handle;
      }
      ,
    }), 8, 4, 4 ],
    [ 'err', 
    _lowerFlatEnum({
      caseMetas: [['access', null, 1, 1, 1],['would-block', null, 1, 1, 1],['already', null, 1, 1, 1],['bad-descriptor', null, 1, 1, 1],['busy', null, 1, 1, 1],['deadlock', null, 1, 1, 1],['quota', null, 1, 1, 1],['exist', null, 1, 1, 1],['file-too-large', null, 1, 1, 1],['illegal-byte-sequence', null, 1, 1, 1],['in-progress', null, 1, 1, 1],['interrupted', null, 1, 1, 1],['invalid', null, 1, 1, 1],['io', null, 1, 1, 1],['is-directory', null, 1, 1, 1],['loop', null, 1, 1, 1],['too-many-links', null, 1, 1, 1],['message-size', null, 1, 1, 1],['name-too-long', null, 1, 1, 1],['no-device', null, 1, 1, 1],['no-entry', null, 1, 1, 1],['no-lock', null, 1, 1, 1],['insufficient-memory', null, 1, 1, 1],['insufficient-space', null, 1, 1, 1],['not-directory', null, 1, 1, 1],['not-empty', null, 1, 1, 1],['not-recoverable', null, 1, 1, 1],['unsupported', null, 1, 1, 1],['no-tty', null, 1, 1, 1],['no-such-device', null, 1, 1, 1],['overflow', null, 1, 1, 1],['not-permitted', null, 1, 1, 1],['pipe', null, 1, 1, 1],['read-only', null, 1, 1, 1],['invalid-seek', null, 1, 1, 1],['text-file-busy', null, 1, 1, 1],['cross-device', null, 1, 1, 1],],
      variantSize32: 1,
      variantAlign32: 1,
      variantPayloadOffset32: 1,
      variantFlatCount: 1,
    })
    , 8, 4, 4 ],
    ],
    variantSize32: 8,
    variantAlign32: 4,
    variantPayloadOffset32: 4,
    variantFlatCount: 2,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline73,
},
);
let trampoline74 = _trampoline74.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 74,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline74.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 7)],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', _lowerFlatRecord({ fieldMetas: [['type', 
    _lowerFlatEnum({
      caseMetas: [['unknown', null, 1, 1, 1],['block-device', null, 1, 1, 1],['character-device', null, 1, 1, 1],['directory', null, 1, 1, 1],['fifo', null, 1, 1, 1],['symbolic-link', null, 1, 1, 1],['regular-file', null, 1, 1, 1],['socket', null, 1, 1, 1],],
      variantSize32: 1,
      variantAlign32: 1,
      variantPayloadOffset32: 1,
      variantFlatCount: 1,
    })
    , 1, 1 ],['linkCount', _lowerFlatU64, 8, 8 ],['size', _lowerFlatU64, 8, 8 ],['dataAccessTimestamp', 
    _lowerFlatOption({
      caseMetas: [
      [ 'none', null, 0, 0, 0 ],
      [ 'some', _lowerFlatRecord({ fieldMetas: [['seconds', _lowerFlatU64, 8, 8 ],['nanoseconds', _lowerFlatU32, 4, 4 ],], size32: 16, align32: 8 }), 16, 8, 2],
      ],
      variantSize32: 24,
      variantAlign32: 8,
      variantPayloadOffset32: 8,
      variantFlatCount: 3,
    })
    , 24, 8 ],['dataModificationTimestamp', 
    _lowerFlatOption({
      caseMetas: [
      [ 'none', null, 0, 0, 0 ],
      [ 'some', _lowerFlatRecord({ fieldMetas: [['seconds', _lowerFlatU64, 8, 8 ],['nanoseconds', _lowerFlatU32, 4, 4 ],], size32: 16, align32: 8 }), 16, 8, 2],
      ],
      variantSize32: 24,
      variantAlign32: 8,
      variantPayloadOffset32: 8,
      variantFlatCount: 3,
    })
    , 24, 8 ],['statusChangeTimestamp', 
    _lowerFlatOption({
      caseMetas: [
      [ 'none', null, 0, 0, 0 ],
      [ 'some', _lowerFlatRecord({ fieldMetas: [['seconds', _lowerFlatU64, 8, 8 ],['nanoseconds', _lowerFlatU32, 4, 4 ],], size32: 16, align32: 8 }), 16, 8, 2],
      ],
      variantSize32: 24,
      variantAlign32: 8,
      variantPayloadOffset32: 8,
      variantFlatCount: 3,
    })
    , 24, 8 ],], size32: 96, align32: 8 }), 104, 8, 8 ],
    [ 'err', 
    _lowerFlatEnum({
      caseMetas: [['access', null, 1, 1, 1],['would-block', null, 1, 1, 1],['already', null, 1, 1, 1],['bad-descriptor', null, 1, 1, 1],['busy', null, 1, 1, 1],['deadlock', null, 1, 1, 1],['quota', null, 1, 1, 1],['exist', null, 1, 1, 1],['file-too-large', null, 1, 1, 1],['illegal-byte-sequence', null, 1, 1, 1],['in-progress', null, 1, 1, 1],['interrupted', null, 1, 1, 1],['invalid', null, 1, 1, 1],['io', null, 1, 1, 1],['is-directory', null, 1, 1, 1],['loop', null, 1, 1, 1],['too-many-links', null, 1, 1, 1],['message-size', null, 1, 1, 1],['name-too-long', null, 1, 1, 1],['no-device', null, 1, 1, 1],['no-entry', null, 1, 1, 1],['no-lock', null, 1, 1, 1],['insufficient-memory', null, 1, 1, 1],['insufficient-space', null, 1, 1, 1],['not-directory', null, 1, 1, 1],['not-empty', null, 1, 1, 1],['not-recoverable', null, 1, 1, 1],['unsupported', null, 1, 1, 1],['no-tty', null, 1, 1, 1],['no-such-device', null, 1, 1, 1],['overflow', null, 1, 1, 1],['not-permitted', null, 1, 1, 1],['pipe', null, 1, 1, 1],['read-only', null, 1, 1, 1],['invalid-seek', null, 1, 1, 1],['text-file-busy', null, 1, 1, 1],['cross-device', null, 1, 1, 1],],
      variantSize32: 1,
      variantAlign32: 1,
      variantPayloadOffset32: 1,
      variantFlatCount: 1,
    })
    , 104, 8, 8 ],
    ],
    variantSize32: 104,
    variantAlign32: 8,
    variantPayloadOffset32: 8,
    variantFlatCount: 13,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline74,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 74,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline74.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 7)],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', _lowerFlatRecord({ fieldMetas: [['type', 
    _lowerFlatEnum({
      caseMetas: [['unknown', null, 1, 1, 1],['block-device', null, 1, 1, 1],['character-device', null, 1, 1, 1],['directory', null, 1, 1, 1],['fifo', null, 1, 1, 1],['symbolic-link', null, 1, 1, 1],['regular-file', null, 1, 1, 1],['socket', null, 1, 1, 1],],
      variantSize32: 1,
      variantAlign32: 1,
      variantPayloadOffset32: 1,
      variantFlatCount: 1,
    })
    , 1, 1 ],['linkCount', _lowerFlatU64, 8, 8 ],['size', _lowerFlatU64, 8, 8 ],['dataAccessTimestamp', 
    _lowerFlatOption({
      caseMetas: [
      [ 'none', null, 0, 0, 0 ],
      [ 'some', _lowerFlatRecord({ fieldMetas: [['seconds', _lowerFlatU64, 8, 8 ],['nanoseconds', _lowerFlatU32, 4, 4 ],], size32: 16, align32: 8 }), 16, 8, 2],
      ],
      variantSize32: 24,
      variantAlign32: 8,
      variantPayloadOffset32: 8,
      variantFlatCount: 3,
    })
    , 24, 8 ],['dataModificationTimestamp', 
    _lowerFlatOption({
      caseMetas: [
      [ 'none', null, 0, 0, 0 ],
      [ 'some', _lowerFlatRecord({ fieldMetas: [['seconds', _lowerFlatU64, 8, 8 ],['nanoseconds', _lowerFlatU32, 4, 4 ],], size32: 16, align32: 8 }), 16, 8, 2],
      ],
      variantSize32: 24,
      variantAlign32: 8,
      variantPayloadOffset32: 8,
      variantFlatCount: 3,
    })
    , 24, 8 ],['statusChangeTimestamp', 
    _lowerFlatOption({
      caseMetas: [
      [ 'none', null, 0, 0, 0 ],
      [ 'some', _lowerFlatRecord({ fieldMetas: [['seconds', _lowerFlatU64, 8, 8 ],['nanoseconds', _lowerFlatU32, 4, 4 ],], size32: 16, align32: 8 }), 16, 8, 2],
      ],
      variantSize32: 24,
      variantAlign32: 8,
      variantPayloadOffset32: 8,
      variantFlatCount: 3,
    })
    , 24, 8 ],], size32: 96, align32: 8 }), 104, 8, 8 ],
    [ 'err', 
    _lowerFlatEnum({
      caseMetas: [['access', null, 1, 1, 1],['would-block', null, 1, 1, 1],['already', null, 1, 1, 1],['bad-descriptor', null, 1, 1, 1],['busy', null, 1, 1, 1],['deadlock', null, 1, 1, 1],['quota', null, 1, 1, 1],['exist', null, 1, 1, 1],['file-too-large', null, 1, 1, 1],['illegal-byte-sequence', null, 1, 1, 1],['in-progress', null, 1, 1, 1],['interrupted', null, 1, 1, 1],['invalid', null, 1, 1, 1],['io', null, 1, 1, 1],['is-directory', null, 1, 1, 1],['loop', null, 1, 1, 1],['too-many-links', null, 1, 1, 1],['message-size', null, 1, 1, 1],['name-too-long', null, 1, 1, 1],['no-device', null, 1, 1, 1],['no-entry', null, 1, 1, 1],['no-lock', null, 1, 1, 1],['insufficient-memory', null, 1, 1, 1],['insufficient-space', null, 1, 1, 1],['not-directory', null, 1, 1, 1],['not-empty', null, 1, 1, 1],['not-recoverable', null, 1, 1, 1],['unsupported', null, 1, 1, 1],['no-tty', null, 1, 1, 1],['no-such-device', null, 1, 1, 1],['overflow', null, 1, 1, 1],['not-permitted', null, 1, 1, 1],['pipe', null, 1, 1, 1],['read-only', null, 1, 1, 1],['invalid-seek', null, 1, 1, 1],['text-file-busy', null, 1, 1, 1],['cross-device', null, 1, 1, 1],],
      variantSize32: 1,
      variantAlign32: 1,
      variantPayloadOffset32: 1,
      variantFlatCount: 1,
    })
    , 104, 8, 8 ],
    ],
    variantSize32: 104,
    variantAlign32: 8,
    variantPayloadOffset32: 8,
    variantFlatCount: 13,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline74,
},
);
let trampoline75 = _trampoline75.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 75,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline75.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 4),_liftFlatList({
    elemLiftFn: _liftFlatU8,
    elemAlign32: 1,
    elemSize32: 1,
    typedArray: Uint8Array,
  })],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', null, 12, 4, 4 ],
    [ 'err', _lowerFlatVariant({
      caseMetas: [[ 'last-operation-failed', _lowerFlatOwn({
        componentIdx: 0,
        lowerFn: 
        function lowerImportedOwnedHost_Error$1(obj) {
          if (!(obj instanceof Error$1)) {
            throw new TypeError('Resource error: Not a valid \"Error$1\" resource.');
          }
          let handle = obj[symbolRscHandle];
          if (!handle) {
            const rep = obj[symbolRscRep] || ++captureCnt1;
            captureTable1.set(rep, obj);
            handle = rscTableCreateOwn(handleTable1, rep);
          }
          return handle;
        }
        ,
      }), 4, 4, 1 ],[ 'closed', null, 0, 0, 0 ],],
      variantSize32: 8,
      variantAlign32: 4,
      variantPayloadOffset32: 4,
      variantFlatCount: 2,
    } ), 12, 4, 4 ],
    ],
    variantSize32: 12,
    variantAlign32: 4,
    variantPayloadOffset32: 4,
    variantFlatCount: 3,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline75,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 75,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline75.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 4),_liftFlatList({
    elemLiftFn: _liftFlatU8,
    elemAlign32: 1,
    elemSize32: 1,
    typedArray: Uint8Array,
  })],
  resultLowerFns: [
  _lowerFlatResult({
    caseMetas: [
    [ 'ok', null, 12, 4, 4 ],
    [ 'err', _lowerFlatVariant({
      caseMetas: [[ 'last-operation-failed', _lowerFlatOwn({
        componentIdx: 0,
        lowerFn: 
        function lowerImportedOwnedHost_Error$1(obj) {
          if (!(obj instanceof Error$1)) {
            throw new TypeError('Resource error: Not a valid \"Error$1\" resource.');
          }
          let handle = obj[symbolRscHandle];
          if (!handle) {
            const rep = obj[symbolRscRep] || ++captureCnt1;
            captureTable1.set(rep, obj);
            handle = rscTableCreateOwn(handleTable1, rep);
          }
          return handle;
        }
        ,
      }), 4, 4, 1 ],[ 'closed', null, 0, 0, 0 ],],
      variantSize32: 8,
      variantAlign32: 4,
      variantPayloadOffset32: 4,
      variantFlatCount: 2,
    } ), 12, 4, 4 ],
    ],
    variantSize32: 12,
    variantAlign32: 4,
    variantPayloadOffset32: 4,
    variantFlatCount: 3,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline75,
},
);
let trampoline76 = _trampoline76.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 76,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline76.manuallyAsync,
  paramLiftFns: [],
  resultLowerFns: [_lowerFlatList({
    elemLowerFn: _lowerFlatTuple({ elemLowerMetas: [[_lowerFlatOwn({
      componentIdx: 0,
      lowerFn: 
      function lowerImportedOwnedHost_Descriptor(obj) {
        if (!(obj instanceof Descriptor)) {
          throw new TypeError('Resource error: Not a valid \"Descriptor\" resource.');
        }
        let handle = obj[symbolRscHandle];
        if (!handle) {
          const rep = obj[symbolRscRep] || ++captureCnt7;
          captureTable7.set(rep, obj);
          handle = rscTableCreateOwn(handleTable7, rep);
        }
        return handle;
      }
      ,
    }), 4, 4],[_lowerFlatStringAny, 8, 4],], size32: 12, align32: 4 }),
    elemSize32: 12,
    elemAlign32: 4,
  })],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: () => realloc1,
  importFn: _trampoline76,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 76,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline76.manuallyAsync,
  paramLiftFns: [],
  resultLowerFns: [_lowerFlatList({
    elemLowerFn: _lowerFlatTuple({ elemLowerMetas: [[_lowerFlatOwn({
      componentIdx: 0,
      lowerFn: 
      function lowerImportedOwnedHost_Descriptor(obj) {
        if (!(obj instanceof Descriptor)) {
          throw new TypeError('Resource error: Not a valid \"Descriptor\" resource.');
        }
        let handle = obj[symbolRscHandle];
        if (!handle) {
          const rep = obj[symbolRscRep] || ++captureCnt7;
          captureTable7.set(rep, obj);
          handle = rscTableCreateOwn(handleTable7, rep);
        }
        return handle;
      }
      ,
    }), 4, 4],[_lowerFlatStringAny, 8, 4],], size32: 12, align32: 4 }),
    elemSize32: 12,
    elemAlign32: 4,
  })],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: () => realloc1,
  importFn: _trampoline76,
},
);
let trampoline77 = _trampoline77.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 77,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline77.manuallyAsync,
  paramLiftFns: [],
  resultLowerFns: [
  _lowerFlatOption({
    caseMetas: [
    [ 'none', null, 0, 0, 0 ],
    [ 'some', _lowerFlatOwn({
      componentIdx: 0,
      lowerFn: 
      function lowerImportedOwnedHost_TerminalInput(obj) {
        if (!(obj instanceof TerminalInput)) {
          throw new TypeError('Resource error: Not a valid \"TerminalInput\" resource.');
        }
        let handle = obj[symbolRscHandle];
        if (!handle) {
          const rep = obj[symbolRscRep] || ++captureCnt5;
          captureTable5.set(rep, obj);
          handle = rscTableCreateOwn(handleTable5, rep);
        }
        return handle;
      }
      ,
    }), 4, 4, 1],
    ],
    variantSize32: 8,
    variantAlign32: 4,
    variantPayloadOffset32: 4,
    variantFlatCount: 2,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline77,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 77,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline77.manuallyAsync,
  paramLiftFns: [],
  resultLowerFns: [
  _lowerFlatOption({
    caseMetas: [
    [ 'none', null, 0, 0, 0 ],
    [ 'some', _lowerFlatOwn({
      componentIdx: 0,
      lowerFn: 
      function lowerImportedOwnedHost_TerminalInput(obj) {
        if (!(obj instanceof TerminalInput)) {
          throw new TypeError('Resource error: Not a valid \"TerminalInput\" resource.');
        }
        let handle = obj[symbolRscHandle];
        if (!handle) {
          const rep = obj[symbolRscRep] || ++captureCnt5;
          captureTable5.set(rep, obj);
          handle = rscTableCreateOwn(handleTable5, rep);
        }
        return handle;
      }
      ,
    }), 4, 4, 1],
    ],
    variantSize32: 8,
    variantAlign32: 4,
    variantPayloadOffset32: 4,
    variantFlatCount: 2,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline77,
},
);
let trampoline78 = _trampoline78.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 78,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline78.manuallyAsync,
  paramLiftFns: [],
  resultLowerFns: [
  _lowerFlatOption({
    caseMetas: [
    [ 'none', null, 0, 0, 0 ],
    [ 'some', _lowerFlatOwn({
      componentIdx: 0,
      lowerFn: 
      function lowerImportedOwnedHost_TerminalOutput(obj) {
        if (!(obj instanceof TerminalOutput)) {
          throw new TypeError('Resource error: Not a valid \"TerminalOutput\" resource.');
        }
        let handle = obj[symbolRscHandle];
        if (!handle) {
          const rep = obj[symbolRscRep] || ++captureCnt6;
          captureTable6.set(rep, obj);
          handle = rscTableCreateOwn(handleTable6, rep);
        }
        return handle;
      }
      ,
    }), 4, 4, 1],
    ],
    variantSize32: 8,
    variantAlign32: 4,
    variantPayloadOffset32: 4,
    variantFlatCount: 2,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline78,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 78,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline78.manuallyAsync,
  paramLiftFns: [],
  resultLowerFns: [
  _lowerFlatOption({
    caseMetas: [
    [ 'none', null, 0, 0, 0 ],
    [ 'some', _lowerFlatOwn({
      componentIdx: 0,
      lowerFn: 
      function lowerImportedOwnedHost_TerminalOutput(obj) {
        if (!(obj instanceof TerminalOutput)) {
          throw new TypeError('Resource error: Not a valid \"TerminalOutput\" resource.');
        }
        let handle = obj[symbolRscHandle];
        if (!handle) {
          const rep = obj[symbolRscRep] || ++captureCnt6;
          captureTable6.set(rep, obj);
          handle = rscTableCreateOwn(handleTable6, rep);
        }
        return handle;
      }
      ,
    }), 4, 4, 1],
    ],
    variantSize32: 8,
    variantAlign32: 4,
    variantPayloadOffset32: 4,
    variantFlatCount: 2,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline78,
},
);
let trampoline79 = _trampoline79.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 79,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline79.manuallyAsync,
  paramLiftFns: [],
  resultLowerFns: [
  _lowerFlatOption({
    caseMetas: [
    [ 'none', null, 0, 0, 0 ],
    [ 'some', _lowerFlatOwn({
      componentIdx: 0,
      lowerFn: 
      function lowerImportedOwnedHost_TerminalOutput(obj) {
        if (!(obj instanceof TerminalOutput)) {
          throw new TypeError('Resource error: Not a valid \"TerminalOutput\" resource.');
        }
        let handle = obj[symbolRscHandle];
        if (!handle) {
          const rep = obj[symbolRscRep] || ++captureCnt6;
          captureTable6.set(rep, obj);
          handle = rscTableCreateOwn(handleTable6, rep);
        }
        return handle;
      }
      ,
    }), 4, 4, 1],
    ],
    variantSize32: 8,
    variantAlign32: 4,
    variantPayloadOffset32: 4,
    variantFlatCount: 2,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline79,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 79,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline79.manuallyAsync,
  paramLiftFns: [],
  resultLowerFns: [
  _lowerFlatOption({
    caseMetas: [
    [ 'none', null, 0, 0, 0 ],
    [ 'some', _lowerFlatOwn({
      componentIdx: 0,
      lowerFn: 
      function lowerImportedOwnedHost_TerminalOutput(obj) {
        if (!(obj instanceof TerminalOutput)) {
          throw new TypeError('Resource error: Not a valid \"TerminalOutput\" resource.');
        }
        let handle = obj[symbolRscHandle];
        if (!handle) {
          const rep = obj[symbolRscRep] || ++captureCnt6;
          captureTable6.set(rep, obj);
          handle = rscTableCreateOwn(handleTable6, rep);
        }
        return handle;
      }
      ,
    }), 4, 4, 1],
    ],
    variantSize32: 8,
    variantAlign32: 4,
    variantPayloadOffset32: 4,
    variantFlatCount: 2,
  })
  ],
  hasResultPointer: true,
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  stringEncoding: 'utf8',
  getMemoryFn: () => memory0,
  getReallocFn: undefined,
  importFn: _trampoline79,
},
);
Promise.all([module0, module1, module2, module3]).catch(() => {});
({ exports: exports0 } = yield instantiateCore(yield module2));
({ exports: exports1 } = yield instantiateCore(yield module0, {
  '[export]canopy:graph/wizard-execution': {
    '[resource-drop]wizard-session': trampoline23,
    '[resource-new]wizard-session': trampoline21,
    '[resource-rep]wizard-session': trampoline22,
  },
  'canopy:graph/draft-session': {
    '[method]draft-session-handle.apply-events': exports0['35'],
    '[method]draft-session-handle.get-node': exports0['37'],
    '[method]draft-session-handle.get-parent-revision': exports0['36'],
    '[method]draft-session-handle.query-nodes': exports0['38'],
    '[resource-drop]draft-session-handle': trampoline24,
  },
  'wasi:clocks/monotonic-clock@0.2.10': {
    now: trampoline6,
    'subscribe-duration': trampoline8,
    'subscribe-instant': trampoline7,
  },
  'wasi:http/outgoing-handler@0.2.10': {
    handle: exports0['31'],
  },
  'wasi:http/types@0.2.10': {
    '[constructor]fields': trampoline10,
    '[constructor]outgoing-request': trampoline13,
    '[constructor]outgoing-response': trampoline17,
    '[method]fields.append': exports0['12'],
    '[method]fields.clone': trampoline11,
    '[method]fields.delete': exports0['11'],
    '[method]fields.entries': exports0['13'],
    '[method]fields.get': exports0['8'],
    '[method]fields.has': exports0['9'],
    '[method]fields.set': exports0['10'],
    '[method]future-incoming-response.get': exports0['30'],
    '[method]future-incoming-response.subscribe': trampoline20,
    '[method]incoming-body.stream': exports0['26'],
    '[method]incoming-request.authority': exports0['17'],
    '[method]incoming-request.consume': exports0['18'],
    '[method]incoming-request.headers': trampoline12,
    '[method]incoming-request.method': exports0['14'],
    '[method]incoming-request.path-with-query': exports0['15'],
    '[method]incoming-request.scheme': exports0['16'],
    '[method]incoming-response.consume': exports0['25'],
    '[method]incoming-response.headers': trampoline16,
    '[method]incoming-response.status': trampoline15,
    '[method]outgoing-body.write': exports0['28'],
    '[method]outgoing-request.body': exports0['19'],
    '[method]outgoing-request.headers': trampoline14,
    '[method]outgoing-request.set-authority': exports0['23'],
    '[method]outgoing-request.set-method': exports0['20'],
    '[method]outgoing-request.set-path-with-query': exports0['21'],
    '[method]outgoing-request.set-scheme': exports0['22'],
    '[method]outgoing-response.body': exports0['27'],
    '[method]outgoing-response.headers': trampoline19,
    '[method]outgoing-response.set-status-code': trampoline18,
    '[static]fields.from-list': exports0['7'],
    '[static]outgoing-body.finish': exports0['29'],
    '[static]response-outparam.set': exports0['24'],
  },
  'wasi:io/poll@0.2.10': {
    '[method]pollable.block': trampoline3,
    '[resource-drop]pollable': trampoline0,
    poll: exports0['0'],
  },
  'wasi:io/streams@0.2.10': {
    '[method]input-stream.blocking-read': exports0['2'],
    '[method]input-stream.read': exports0['1'],
    '[method]input-stream.subscribe': trampoline4,
    '[method]output-stream.blocking-flush': exports0['5'],
    '[method]output-stream.check-write': exports0['3'],
    '[method]output-stream.subscribe': trampoline5,
    '[method]output-stream.write': exports0['4'],
    '[resource-drop]input-stream': trampoline1,
    '[resource-drop]output-stream': trampoline2,
  },
  'wasi:random/random@0.2.10': {
    'get-random-bytes': exports0['6'],
    'get-random-u64': trampoline9,
  },
  wasi_snapshot_preview1: {
    clock_time_get: exports0['33'],
    fd_fdstat_get: exports0['34'],
    fd_write: exports0['32'],
  },
}));
({ exports: exports2 } = yield instantiateCore(yield module1, {
  __main_module__: {
    cabi_realloc_adapter: exports1.cabi_realloc_adapter,
  },
  env: {
    memory: exports1.memory,
  },
  'wasi:cli/stderr@0.2.3': {
    'get-stderr': trampoline27,
  },
  'wasi:cli/stdin@0.2.3': {
    'get-stdin': trampoline30,
  },
  'wasi:cli/stdout@0.2.3': {
    'get-stdout': trampoline31,
  },
  'wasi:cli/terminal-input@0.2.3': {
    '[resource-drop]terminal-input': trampoline28,
  },
  'wasi:cli/terminal-output@0.2.3': {
    '[resource-drop]terminal-output': trampoline29,
  },
  'wasi:cli/terminal-stderr@0.2.3': {
    'get-terminal-stderr': exports0['53'],
  },
  'wasi:cli/terminal-stdin@0.2.3': {
    'get-terminal-stdin': exports0['51'],
  },
  'wasi:cli/terminal-stdout@0.2.3': {
    'get-terminal-stdout': exports0['52'],
  },
  'wasi:clocks/monotonic-clock@0.2.3': {
    now: trampoline6,
  },
  'wasi:clocks/wall-clock@0.2.3': {
    now: exports0['39'],
  },
  'wasi:filesystem/preopens@0.2.3': {
    'get-directories': exports0['50'],
  },
  'wasi:filesystem/types@0.2.3': {
    '[method]descriptor.append-via-stream': exports0['44'],
    '[method]descriptor.get-flags': exports0['40'],
    '[method]descriptor.get-type': exports0['41'],
    '[method]descriptor.stat': exports0['45'],
    '[method]descriptor.write-via-stream': exports0['43'],
    '[resource-drop]descriptor': trampoline26,
    'filesystem-error-code': exports0['42'],
  },
  'wasi:io/error@0.2.3': {
    '[resource-drop]error': trampoline25,
  },
  'wasi:io/streams@0.2.3': {
    '[method]output-stream.blocking-flush': exports0['49'],
    '[method]output-stream.blocking-write-and-flush': exports0['48'],
    '[method]output-stream.check-write': exports0['46'],
    '[method]output-stream.write': exports0['47'],
    '[resource-drop]input-stream': trampoline1,
    '[resource-drop]output-stream': trampoline2,
  },
}));
memory0 = exports1.memory;
realloc0 = exports1.cabi_realloc;

try {
  realloc0Async = WebAssembly.promising(exports1.cabi_realloc);
} catch(err) {
  realloc0Async = exports1.cabi_realloc;
}

realloc1 = exports2.cabi_import_realloc;

try {
  realloc1Async = WebAssembly.promising(exports2.cabi_import_realloc);
} catch(err) {
  realloc1Async = exports2.cabi_import_realloc;
}

({ exports: exports3 } = yield instantiateCore(yield module3, {
  '': {
    $imports: exports0.$imports,
    '0': trampoline32,
    '1': trampoline33,
    '10': trampoline42,
    '11': trampoline43,
    '12': trampoline44,
    '13': trampoline45,
    '14': trampoline46,
    '15': trampoline47,
    '16': trampoline48,
    '17': trampoline49,
    '18': trampoline50,
    '19': trampoline51,
    '2': trampoline34,
    '20': trampoline52,
    '21': trampoline53,
    '22': trampoline54,
    '23': trampoline55,
    '24': trampoline56,
    '25': trampoline57,
    '26': trampoline58,
    '27': trampoline59,
    '28': trampoline60,
    '29': trampoline61,
    '3': trampoline35,
    '30': trampoline62,
    '31': trampoline63,
    '32': exports2.fd_write,
    '33': exports2.clock_time_get,
    '34': exports2.fd_fdstat_get,
    '35': trampoline64,
    '36': trampoline65,
    '37': trampoline66,
    '38': trampoline67,
    '39': trampoline68,
    '4': trampoline36,
    '40': trampoline69,
    '41': trampoline70,
    '42': trampoline71,
    '43': trampoline72,
    '44': trampoline73,
    '45': trampoline74,
    '46': trampoline35,
    '47': trampoline36,
    '48': trampoline75,
    '49': trampoline37,
    '5': trampoline37,
    '50': trampoline76,
    '51': trampoline77,
    '52': trampoline78,
    '53': trampoline79,
    '6': trampoline38,
    '7': trampoline39,
    '8': trampoline40,
    '9': trampoline41,
  },
}));
postReturn0 = exports1['cabi_post_canopy:graph/plugin-lifecycle#get-manifest'];

try {
  postReturn0Async = WebAssembly.promising(exports1['cabi_post_canopy:graph/plugin-lifecycle#get-manifest']);
} catch(err) {
  postReturn0Async = exports1['cabi_post_canopy:graph/plugin-lifecycle#get-manifest'];
}

postReturn1 = exports1['cabi_post_canopy:graph/plugin-lifecycle#initialize'];

try {
  postReturn1Async = WebAssembly.promising(exports1['cabi_post_canopy:graph/plugin-lifecycle#initialize']);
} catch(err) {
  postReturn1Async = exports1['cabi_post_canopy:graph/plugin-lifecycle#initialize'];
}

postReturn2 = exports1['cabi_post_canopy:graph/plugin-lifecycle#shutdown'];

try {
  postReturn2Async = WebAssembly.promising(exports1['cabi_post_canopy:graph/plugin-lifecycle#shutdown']);
} catch(err) {
  postReturn2Async = exports1['cabi_post_canopy:graph/plugin-lifecycle#shutdown'];
}

postReturn3 = exports1['cabi_post_canopy:graph/wizard-execution#[constructor]wizard-session'];

try {
  postReturn3Async = WebAssembly.promising(exports1['cabi_post_canopy:graph/wizard-execution#[constructor]wizard-session']);
} catch(err) {
  postReturn3Async = exports1['cabi_post_canopy:graph/wizard-execution#[constructor]wizard-session'];
}

postReturn4 = exports1['cabi_post_canopy:graph/wizard-execution#[method]wizard-session.render-step-schema'];

try {
  postReturn4Async = WebAssembly.promising(exports1['cabi_post_canopy:graph/wizard-execution#[method]wizard-session.render-step-schema']);
} catch(err) {
  postReturn4Async = exports1['cabi_post_canopy:graph/wizard-execution#[method]wizard-session.render-step-schema'];
}

postReturn5 = exports1['cabi_post_canopy:graph/wizard-execution#[method]wizard-session.handle-step-submission'];

try {
  postReturn5Async = WebAssembly.promising(exports1['cabi_post_canopy:graph/wizard-execution#[method]wizard-session.handle-step-submission']);
} catch(err) {
  postReturn5Async = exports1['cabi_post_canopy:graph/wizard-execution#[method]wizard-session.handle-step-submission'];
}

pluginLifecycleGetManifest = exports1['canopy:graph/plugin-lifecycle#get-manifest'];
pluginLifecycleInitialize = exports1['canopy:graph/plugin-lifecycle#initialize'];
pluginLifecycleShutdown = exports1['canopy:graph/plugin-lifecycle#shutdown'];
wizardExecutionConstructorWizardSession = exports1['canopy:graph/wizard-execution#[constructor]wizard-session'];
wizardExecutionMethodWizardSessionRenderStepSchema = exports1['canopy:graph/wizard-execution#[method]wizard-session.render-step-schema'];
wizardExecutionMethodWizardSessionHandleStepSubmission = exports1['canopy:graph/wizard-execution#[method]wizard-session.handle-step-submission'];
const pluginLifecycle = {
  getManifest: getManifest,
  initialize: initialize,
  shutdown: shutdown,
  
};
const wizardExecution = {
  WizardSession: WizardSession,
  
};

return { pluginLifecycle, wizardExecution, 'canopy:graph/plugin-lifecycle': pluginLifecycle, 'canopy:graph/wizard-execution': wizardExecution,  };
})();
let promise, resolve, reject;
function runNext (value) {
  try {
    let done;
    do {
      ({ value, done } = gen.next(value));
    } while (!(value instanceof Promise) && !done);
    if (done) {
      if (resolve) return resolve(value);
      else return value;
    }
    if (!promise) promise = new Promise((_resolve, _reject) => (resolve = _resolve, reject = _reject));
    value.then(nextVal => done ? resolve() : runNext(nextVal), reject);
  }
  catch (e) {
    if (reject) reject(e);
    else throw e;
  }
}
const maybeSyncReturn = runNext(null);
return promise || maybeSyncReturn;
};
