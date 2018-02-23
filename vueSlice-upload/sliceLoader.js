let chunkSize = 5 * 1024 * 1024
let fileSize = 0
let hasUploaded = 0
let chunks = 0
import SparkMD5 from "spark-md5"
import getJson from "./getJson.js"
import request from "./request.js"
export default {
    data(){
        return {
            checkProgress:0,
            loadProgress: 0
        }
    },
    props: {
        baseUrl:{
            type: String,
            default: ''
        },
        sliceUpload: {
            type: Boolean,
            default: true 
        },
        sliceSize: {
            type: Number,
            default: 5
        },
        checkUrl: {
            type: String,
            default: ''
        },
        postUrl: {
            type: String,
            default: ''
        },
        mergeUrl: {
            type: String,
            default: ''
        }
    },
    methods:{
        async sliceResponseChange(file) {
            // 第一步：按照 修改时间+文件名称+最后修改时间-->MD5
            // 开始校验
            let fileMd5Value = await this.md5File(file)
            // 第二步：校验文件的MD5
            let result = {}
            if( this.checkUrl && this.checkUrl!=''){
                result = await this.checkFileMD5(file.name, fileMd5Value,file)
                // // 如果文件已存在, 就秒传
                if (result.file) {
                    // alert('文件已秒传')
                    this.loadProgress = 80
                    setTimeout(()=>{
                        this.loadProgress = 100
                    },300)
                    // this.onChange()
                    return
                }
            }
            
            // 第三步：检查并上传MD5
            await this.checkAndUploadChunk(fileMd5Value, result.chunkList||[], file)
            if( this.mergeUrl && this.mergeUrl!=''){
                // 第四步: 通知服务器所有分片已上传完成
                this.notifyServer(fileMd5Value, file)
            }
        },

        // 1.修改时间+文件名称+最后修改时间-->MD5
        md5File(file) {
            let self = this
            return new Promise((resolve, reject) => {
                var blobSlice = File.prototype.slice || File.prototype.mozSlice || File.prototype.webkitSlice,
                    //chunkSize = 2097152, // Read in chunks of 2MB
                    chunkSize = file.size / 100,
                    
                    //chunks = Math.ceil(file.size / chunkSize),
                    chunks = 100,
                    currentChunk = 0,
                    spark = new SparkMD5.ArrayBuffer(),
                    fileReader = new FileReader();
                    console.log('校验', chunkSize)
                    fileReader.onload = function (e) {
                        console.log('read chunk nr', currentChunk + 1, 'of', chunks);
                        spark.append(e.target.result); // Append array buffer
                        currentChunk++;

                        if (currentChunk < chunks) {
                            loadNext();
                        } else {
                            let cur = +(new Date())
                            console.log('finished loading');
                            // alert(spark.end() + '---' + (cur - pre)); // Compute hash
                            let result = spark.end()
                            resolve(result)
                        }
                    };

                fileReader.onerror = function () {
                    console.warn('oops, something went wrong.');
                };

                function loadNext() {
                    var start = currentChunk * chunkSize,
                        end = ((start + chunkSize) >= file.size) ? file.size : start + chunkSize;

                    fileReader.readAsArrayBuffer(blobSlice.call(file, start, end));
                    self.checkProgress = currentChunk + 1
                }

                loadNext();
            })
        },
        // 2.校验文件的MD5
        checkFileMD5(fileName, fileMd5Value, file) {
            let self = this
            return new Promise((resolve, reject) => {
                let url = this.baseUrl + this.checkUrl+'?fileName=' + fileName + "&fileMd5Value=" + fileMd5Value
                getJson({
                    onError: function(){
                        console.log('出错了')
                        self.onChange({ file: file, fileList: this.computed_fileList, status:'checkError'})
                    },
                    onProgress: function(){
                    },
                    onSuccess: function(data){
                        self.onChange({ file: file, fileList: this.computed_fileList, status:'checkOk'})                        
                        resolve(data)
                    },
                    action: url
                })
            })
        },
        // 3.上传chunk
        async checkAndUploadChunk(fileMd5Value, chunkList, file) {
            let fileSize = file.size, self = this;
            chunks = Math.ceil(fileSize / chunkSize)
            hasUploaded = chunkList.length
            console.log('上传', chunks, chunkSize, fileSize )
            self.loadProgress = 0
            for (let i = 0; i < chunks; i++) {
                let exit = chunkList.indexOf(i + "") > -1
                // 如果已经存在, 则不用再上传当前块
                if (!exit) {
                    let index = await self.sliceUploadDone(i, fileMd5Value, chunks, file)
                    hasUploaded++
                    let radio = Math.floor((hasUploaded / chunks) * 100)
                    if(radio == 0){
                        self.loadProgress = 1 
                    }else{
                        self.loadProgress =radio
                    }                   
                }else{
                    console.log('存在了')
                }
            }
        },

        // 3-2. 上传chunk
        sliceUploadDone(i, fileMd5Value, chunks, file) {
            let self = this
            return new Promise((resolve, reject) => {
                //构造一个表单，FormData是HTML5新增的
                let end = (i + 1) * chunkSize >= file.size ? file.size : (i + 1) * chunkSize
                console.log( file, 'file')
                let params = {
                    data: file.slice(i * chunkSize, end),
                    total: chunks,
                    index: i,
                    fileMd5Value: fileMd5Value,
                    fileName: file.name,
                }
                console.log(this.data, 98233, '你好')
                for(let key in this.data){
                    params[key] = this.data[key]
                }
                request({
                    data: params,
                    fileName: file.name,
                    file: file,
                    action: this.baseUrl + self.postUrl,
                    onProgress: function(){
                    },
                    onSuccess: function(data){
                        if( data.code != 0){
                            reject(i)
                        }else{
                            self.onChange({ file: file, fileList: this.computed_fileList, status:'uploadOK', index: i, allIndex: chunks})
                            resolve(i)
                        }
                    },
                    onError: function(){
                        console.log('出错了')
                        self.onChange({ file: file, fileList: this.computed_fileList, status:'uploadError', index: i, allIndex: chunks})
                    },
                })
            })

        },

        // 第四步: 通知服务器所有分片已上传完成
        notifyServer(fileMd5Value,file) {
            let url = this.baseUrl + this.mergeUrl+'?md5=' + fileMd5Value + "&fileName=" + file.name + "&size=" + file.size
            let self = this
            getJson({
                onError: function(){
                    console.log('出错了')
                    self.onChange({ file: file, fileList: this.computed_fileList, status:'mergeError'})
                    
                },
                onProgress: function(){
                },
                onSuccess: function(){
                    self.onChange({file: file, fileList: this.computed_fileList, status:'mergeOk'})
                    // self.loadProgress = 0
                },
                action: url
            })
        }
    }
}