// 文件上传
function getError (option, xhr) {
    const msg = `cannot post ${option.action} ${xhr.status}`
    const err = new Error(msg);
    err.status = xhr.status;
    err.method = 'post';
    err.url = option.action;
    return err
  }
  
  function getBody (xhr) {
    let text;
    if('text' == xhr.responseType || '' == xhr.responseType ) {
      text = xhr.responseText || xhr.response;
    } else{
      text = xhr.response;
    }
    if (!text) {
      return text;
    }
    try {
      return JSON.parse(text);
    } catch (e) {
      return text;
    }
  }
  
  export default function getJson (option) {
    if(typeof XMLHttpRequest === 'undefined') {
      return;
    }

    const xhr = new XMLHttpRequest();
    //设置xhr请求的超时时间
    xhr.timeout = 3600000;
    //设置响应返回的数据格式
    xhr.responseType = 'json';
  
  
    // 上传阶段， 每50ms触发一次。
    if(xhr.upload) {
      xhr.upload.onprogress = e => {
        if (e.total > 0) {
          e.percent = e.loaded / e.total * 100;
        }
        option.onProgress(e);
      }
    }
  
    // 当到达xhr.timeout所设置时间请求还未结束时触发
    xhr.ontimeout = e => {
      option.onError(e);
    };
  
    // 发生了网络层级别的异常才会触发
    xhr.onerror = e => {
      option.onError(e);
    };
  
    // 当请求成功完成时触发
    xhr.onload = () => {
      if (xhr.status !== 200) {
        return option.onError(getError(option, xhr), getBody(xhr));
      }
      option.onSuccess(getBody(xhr));
    }

    xhr.open('GET', option.action, true);
    // xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
    xhr.send(null);
  }
  