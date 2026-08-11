import VFS from './index.js'
import OSBackend from './backends/os.js'
import VRBackend from './backends/vr.js'
import S3Backend from './backends/s3.js'
import JSQLBackend from './backends/jsql.js'

export default VFS
export { OSBackend, VRBackend, S3Backend, JSQLBackend }